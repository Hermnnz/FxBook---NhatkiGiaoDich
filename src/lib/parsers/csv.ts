import Papa from 'papaparse';
import { z } from 'zod';
import type { Trade } from '@/types';
import type { ParseResult } from './shared';
import { blankTrade, makeImportKey, parseNumber, parseTimestamp } from './shared';

const aliases: Record<string, string[]> = {
  date: ['date', 'open_time', 'time', 'ngay'], close_time: ['close_time', 'closed_at', 'ngay_dong'],
  symbol: ['symbol', 'ma', 'cap'], direction: ['direction', 'type', 'side', 'buy_sell'],
  volume: ['volume', 'lot', 'lots', 'khoi_luong'], profit: ['profit', 'gross_profit', 'pnl', 'loi_nhuan'],
  fee: ['fee', 'fees', 'phi'], commission: ['commission'], swap: ['swap'],
  entry_price: ['entry_price', 'entry', 'price_open'], exit_price: ['exit_price', 'exit', 'price_close'],
  sl_price: ['sl_price', 'sl'], tp_price: ['tp_price', 'tp'], setup: ['setup'],
  timeframe: ['timeframe', 'tf'], session: ['session', 'phien'],
  theoretical_profit: ['theoretical_profit'], risk_amount: ['risk_amount'],
  tradingview_url: ['tradingview_url', 'chart_url'], note: ['note', 'notes', 'ghi_chu'],
  mt5_key: ['mt5_key'],
};
const required = ['date', 'symbol', 'direction', 'volume', 'profit'];
const schema = z.object({
  symbol: z.string().trim().min(1), direction: z.enum(['buy', 'sell']),
  volume: z.number().positive(), profit: z.number().finite(), fee: z.number().finite(),
});

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function parseCsv(content: string, accountId: string): ParseResult {
  const result: ParseResult = { format: 'csv', trades: [], issues: [] };
  const parsed = Papa.parse<string[]>(content.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  for (const error of parsed.errors) result.issues.push({ row: (error.row ?? 0) + 1, message: error.message });
  // A malformed quote can shift later columns and rows. Do not import a partial interpretation.
  if (parsed.errors.length) return result;
  const [header, ...rows] = parsed.data;
  if (!header?.length) return { ...result, issues: [{ row: 1, message: 'File CSV rỗng.' }] };
  const normalized = header.map(normalizeHeader);
  const index = (name: string) => normalized.findIndex((h) => aliases[name]?.includes(h));
  const missing = required.filter((name) => index(name) < 0);
  if (index('fee') < 0 && index('commission') < 0 && index('swap') < 0) missing.push('fee hoặc commission/swap');
  if (missing.length) {
    result.issues.push({ row: 1, message: `Thiếu cột bắt buộc: ${missing.join(', ')}.` });
    return result;
  }
  const get = (row: string[], name: string) => index(name) < 0 ? '' : (row[index(name)] ?? '').trim();
  const optionalNumber = (row: string[], name: string) => {
    const raw = get(row, name);
    return raw ? parseNumber(raw) : null;
  };

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2;
    const row = rows[i];
    if (row.length !== header.length) {
      result.issues.push({ row: rowNumber, message: `Số cột ${row.length} khác tiêu đề ${header.length}.` });
      continue;
    }
    const date = parseTimestamp(get(row, 'date'));
    const closeTimeRaw = get(row, 'close_time');
    const closeTime = closeTimeRaw ? parseTimestamp(closeTimeRaw) : null;
    const directionRaw = get(row, 'direction').toLowerCase();
    const direction = directionRaw === 'long' ? 'buy' : directionRaw === 'short' ? 'sell' : directionRaw;
    const profit = optionalNumber(row, 'profit');
    const volume = optionalNumber(row, 'volume');
    const feeRaw = optionalNumber(row, 'fee');
    const commission = optionalNumber(row, 'commission');
    const swap = optionalNumber(row, 'swap');
    const invalidMoney = (name: 'fee' | 'commission' | 'swap', value: number | null) => get(row, name) !== '' && value === null;
    if (invalidMoney('fee', feeRaw) || invalidMoney('commission', commission) || invalidMoney('swap', swap)) {
      result.issues.push({ row: rowNumber, message: 'fee/commission/swap không phải số; lệnh được bỏ qua.' });
      continue;
    }
    // Explicit fee is signed net cost. MT5-style commission/swap are signed cash flows.
    const fee = feeRaw ?? -(commission ?? 0) - (swap ?? 0);
    const validated = schema.safeParse({ symbol: get(row, 'symbol'), direction, volume, profit, fee });
    if (!date || (closeTimeRaw && !closeTime) || (date && closeTime && closeTime < date) || !validated.success) {
      const problems = [!date && 'date phải là ISO 8601 kèm múi giờ', closeTimeRaw && !closeTime && 'close_time không hợp lệ', date && closeTime && closeTime < date && 'close_time trước date', !validated.success && 'symbol/direction/volume/profit/fee không hợp lệ'].filter(Boolean);
      result.issues.push({ row: rowNumber, message: problems.join('; ') });
      continue;
    }
    const trade = blankTrade(accountId);
    trade.date = date;
    trade.close_time = closeTime;
    trade.symbol = validated.data.symbol.toUpperCase();
    trade.direction = validated.data.direction;
    trade.volume = validated.data.volume;
    trade.profit = validated.data.profit;
    trade.fee = validated.data.fee;
    let optionalInvalid = false;
    for (const name of ['entry_price', 'exit_price', 'sl_price', 'tp_price', 'theoretical_profit', 'risk_amount'] as const) {
      const raw = get(row, name);
      const value = optionalNumber(row, name);
      if (raw && value === null) {
        result.issues.push({ row: rowNumber, message: `${name} không phải số; lệnh được bỏ qua.` });
        optionalInvalid = true;
        break;
      }
      trade[name] = value;
    }
    if (optionalInvalid) continue;
    for (const name of ['setup', 'timeframe', 'session', 'tradingview_url', 'note'] as const) trade[name] = get(row, name) || null;
    trade.incomplete = !trade.setup || !trade.eval_before.length;
    const suppliedKey = get(row, 'mt5_key');
    if (suppliedKey && !/^(?:mt5_[0-9]+_[0-9]+|csv_[a-f0-9]{16})$/.test(suppliedKey)) {
      result.issues.push({ row: rowNumber, message: 'mt5_key không đúng định dạng; lệnh được bỏ qua.' });
      continue;
    }
    trade.mt5_key = suppliedKey || makeImportKey('csv', [accountId, trade.date, trade.close_time, trade.symbol, trade.direction, trade.volume, trade.profit, trade.fee, trade.entry_price, trade.exit_price]);
    result.trades.push({ row: rowNumber, trade, sourceId: trade.mt5_key });
  }
  return result;
}

export const CSV_TEMPLATE = 'date,close_time,symbol,direction,volume,profit,fee,entry_price,sl_price,tp_price,exit_price,setup,timeframe,session,note\n2026-09-17T09:00:00+07:00,2026-09-17T10:00:00+07:00,XAUUSD,buy,0.1,100,5,3650.50,3640,3670,3660.50,Breakout,M15,London,Vi du\n';

const EXPORT_FIELDS = ['date', 'close_time', 'symbol', 'direction', 'volume', 'profit', 'fee', 'entry_price', 'sl_price', 'tp_price', 'exit_price', 'theoretical_profit', 'risk_amount', 'setup', 'timeframe', 'session', 'tradingview_url', 'note', 'mt5_key'] as const;
type ExportableTrade = Pick<Trade, typeof EXPORT_FIELDS[number]>;

/** Canonical CSV that parseCsv can read again without changing dates, prices or signed fees. */
export function serializeTradesCsv(trades: ExportableTrade[]): string {
  const data = trades.map((trade) => EXPORT_FIELDS.map((field) => trade[field] ?? ''));
  return '\uFEFF' + Papa.unparse({ fields: [...EXPORT_FIELDS], data });
}
