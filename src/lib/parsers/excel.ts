import type { ParseResult } from './shared';
import { blankTrade, makeImportKey, parseNumber, parseTimestamp } from './shared';

export type ExcelCell = string | number | boolean | Date | null | undefined;
export type ExcelRows = ExcelCell[][];
export type ExcelOptions = {
  defaultAccountId: string;
  accountMap: Record<string, string>;
  utcOffsetMinutes: number;
  profitMeaning: 'gross' | 'net';
  commissionMeaning: 'cash_flow' | 'cost';
  defaultVolume?: number;
  date1904?: boolean;
};

const aliases: Record<string, string[]> = {
  account: ['account', 'tai_khoan', 'trading_account', 'acc'],
  date: ['day', 'date', 'ngay', 'open_time', 'open_date', 'ngay_vao', 'ngay_mo'],
  close_time: ['close_time', 'close_date', 'closed_at', 'exit_time', 'ngay_dong'],
  symbol: ['symbol', 'pair', 'instrument', 'ma', 'cap_giao_dich', 'asset', 'cap_tien'],
  direction: ['direction', 'side', 'type', 'l_s', 'long_short', 'buy_sell', 'chieu', 'vi_the'],
  volume: ['volume', 'lot', 'lots', 'size', 'khoi_luong', 'so_lot', 'khoi_luong_lot'],
  profit: ['profit', 'profit_usd', 'p_l', 'p_l_usd', 'pnl', 'pnl_usd', 'net_profit', 'net_pnl', 'gross_profit', 'realized_p_l', 'loi_nhuan', 'lai_lo'],
  fee: ['fee', 'fee_usd', 'fees', 'net_fee', 'phi', 'chi_phi'],
  commission: ['commission', 'commissions', 'hoa_hong'],
  swap: ['swap', 'overnight', 'qua_dem'],
  entry_price: ['entry', 'entry_price', 'open_price', 'price_open', 'gia_vao'],
  sl_price: ['sl', 'stop_loss', 'stoploss', 'sl_price', 'gia_sl', 'cat_lo'],
  tp_price: ['tp', 'take_profit', 'takeprofit', 'tp_price', 'gia_tp', 'chot_loi'],
  exit_price: ['exit', 'exit_price', 'close_price', 'price_close', 'gia_dong'],
  theoretical_profit: ['theoretical_profit', 'planned_profit', 'loi_nhuan_lt'],
  risk_amount: ['risk_amount', 'risk_usd', 'risk_money'],
  setup: ['setup', 'strategy', 'chien_luoc'],
  timeframe: ['timeframe', 'tf', 'khung_thoi_gian'],
  session: ['session', 'phien'],
  tradingview_url: ['chart', 'chart_url', 'tradingview_url', 'link_chart', 'hinh_anh'],
  note: ['note', 'notes', 'ghi_chu', 'comment', 'ly_do_vao_lenh', 'ly_do', 'nhan_dinh'],
  external_id: ['ticket', 'position', 'position_id', 'trade_id', 'order_id', 'id'],
};

function cellText(cell: ExcelCell): string {
  if (cell == null) return '';
  if (cell instanceof Date) return cell.toISOString();
  return String(cell).trim();
}

function normalized(value: ExcelCell): string {
  return cellText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function headerIndex(header: ExcelCell[], name: string): number {
  return header.findIndex((cell) => aliases[name]?.includes(normalized(cell)));
}

export function findExcelHeader(rows: ExcelRows): number {
  return rows.slice(0, 30).findIndex((row) =>
    ['date', 'symbol', 'profit'].every((name) => headerIndex(row, name) >= 0));
}

export function excelAccountLabels(rows: ExcelRows): string[] {
  const headerRow = findExcelHeader(rows);
  if (headerRow < 0) return [];
  const accountColumn = headerIndex(rows[headerRow], 'account');
  if (accountColumn < 0) return [];
  const symbolColumn = headerIndex(rows[headerRow], 'symbol');
  const profitColumn = headerIndex(rows[headerRow], 'profit');
  return [...new Set(rows.slice(headerRow + 1)
    .filter((row) => cellText(row[symbolColumn]) && cellText(row[profitColumn]))
    .map((row) => cellText(row[accountColumn])).filter(Boolean))];
}

function parseExcelDate(cell: ExcelCell, offsetMinutes: number, date1904: boolean): string | null {
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return null;
    return parseExcelDate(cell.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, ''), offsetMinutes, date1904);
  }
  if (typeof cell === 'number') {
    if (!Number.isFinite(cell) || cell < 1 || cell > 2_958_465) return null;
    const origin = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    const local = new Date(origin + Math.round(cell * 86_400_000));
    return parseTimestamp(local.toISOString().slice(0, 19).replace('T', ' '), offsetMinutes);
  }
  const raw = cellText(cell);
  if (!raw) return null;
  const zoned = parseTimestamp(raw);
  if (zoned) return zoned;
  const local = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (local) {
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = local;
    return parseTimestamp(`${year}-${month}-${day} ${hour}:${minute}:${second}`, offsetMinutes);
  }
  const dayFirst = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!dayFirst) return null;
  const [, rawDay, rawMonth, rawYear, hour = '00', minute = '00', second = '00'] = dayFirst;
  const [day, month] = +rawMonth > 12 && +rawDay <= 12 ? [rawMonth, rawDay] : [rawDay, rawMonth];
  const year = rawYear.length === 2 ? String(2000 + +rawYear) : rawYear;
  return parseTimestamp(`${year}-${month}-${day} ${hour}:${minute}:${second}`, offsetMinutes);
}

function optionalNumber(value: ExcelCell): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return parseNumber(cellText(value));
}

export function parseExcelRows(rows: ExcelRows, options: ExcelOptions): ParseResult {
  const result: ParseResult = { format: 'excel', trades: [], issues: [] };
  const headerRow = findExcelHeader(rows);
  if (headerRow < 0) {
    result.issues.push({ row: 1, message: 'Không tìm thấy hàng tiêu đề có Day/Date, Symbol và Profit/P&L.' });
    return result;
  }
  if (!Number.isInteger(options.utcOffsetMinutes) || options.utcOffsetMinutes < -720 || options.utcOffsetMinutes > 840) {
    result.issues.push({ row: 0, message: 'Múi giờ không hợp lệ.' });
    return result;
  }
  const header = rows[headerRow];
  const index = (name: string) => headerIndex(header, name);
  const missing = ['direction', 'profit'].filter((name) => index(name) < 0);
  if (index('volume') < 0 && !(options.defaultVolume && options.defaultVolume > 0)) missing.push('volume hoặc khối lượng mặc định');
  if (missing.length) {
    result.issues.push({ row: headerRow + 1, message: `Thiếu cột bắt buộc: ${missing.join(', ')}.` });
    return result;
  }
  if (index('fee') < 0 && index('commission') < 0 && index('swap') < 0) {
    result.issues.push({ row: headerRow + 1, message: 'Không có cột phí; phí được lưu là 0. Hãy đối chiếu P&L ròng với file gốc.' });
  }
  const get = (row: ExcelCell[], name: string): ExcelCell => index(name) < 0 ? '' : row[index(name)];
  const seen = new Set<string>();
  let blankFeeCount = 0;
  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.some((cell) => cellText(cell))) continue;
    if (!cellText(get(row, 'symbol')) && !cellText(get(row, 'profit'))) continue;
    const rowNumber = i + 1;
    const accountLabel = cellText(get(row, 'account'));
    const accountId = index('account') >= 0 ? options.accountMap[accountLabel] : options.defaultAccountId;
    const date = parseExcelDate(get(row, 'date'), options.utcOffsetMinutes, !!options.date1904);
    const closeRaw = get(row, 'close_time');
    const closeTime = cellText(closeRaw) ? parseExcelDate(closeRaw, options.utcOffsetMinutes, !!options.date1904) : null;
    const directionRaw = normalized(get(row, 'direction'));
    const direction = ['buy', 'long', 'l', 'mua'].includes(directionRaw) ? 'buy'
      : ['sell', 'short', 's', 'ban'].includes(directionRaw) ? 'sell' : null;
    const volumeCell = get(row, 'volume');
    const volume = index('volume') >= 0 && cellText(volumeCell)
      ? optionalNumber(volumeCell) : options.defaultVolume ?? null;
    const reportedProfit = optionalNumber(get(row, 'profit'));
    const feeRaw = get(row, 'fee');
    const commissionRaw = get(row, 'commission');
    const swapRaw = get(row, 'swap');
    const feeCells = index('fee') >= 0 ? [feeRaw] : [commissionRaw, swapRaw];
    const invalidFee = feeCells.some((cell) => cellText(cell) && optionalNumber(cell) === null);
    // An explicit Fee column is signed cost; the user chooses the convention for Commission/Swap.
    if (index('fee') >= 0 && !cellText(feeRaw)) blankFeeCount++;
    const fee = index('fee') >= 0 ? (cellText(feeRaw) ? optionalNumber(feeRaw) : 0) :
      (options.commissionMeaning === 'cash_flow' ? -1 : 1) *
      ((optionalNumber(commissionRaw) ?? 0) + (optionalNumber(swapRaw) ?? 0));
    if (!accountId || !date || (cellText(closeRaw) && !closeTime) || (closeTime && closeTime < date) ||
        !direction || !cellText(get(row, 'symbol')) || volume === null || volume <= 0 ||
        reportedProfit === null || invalidFee || fee === null) {
      result.issues.push({ row: rowNumber, message: 'Thiếu ánh xạ Account, ngày, Symbol, chiều, Lot, Profit hoặc có dữ liệu phí không hợp lệ.' });
      continue;
    }
    const trade = blankTrade(accountId);
    trade.date = date;
    trade.close_time = closeTime;
    trade.symbol = cellText(get(row, 'symbol')).toUpperCase();
    trade.direction = direction;
    trade.volume = volume;
    trade.fee = fee;
    trade.profit = options.profitMeaning === 'net' ? reportedProfit + fee : reportedProfit;
    let invalid = false;
    for (const name of ['entry_price', 'sl_price', 'tp_price', 'exit_price', 'theoretical_profit', 'risk_amount'] as const) {
      const raw = get(row, name);
      const value = optionalNumber(raw);
      if (cellText(raw) && (value === null || (name !== 'theoretical_profit' && value <= 0))) {
        result.issues.push({ row: rowNumber, message: `${name} không hợp lệ; lệnh được bỏ qua.` });
        invalid = true;
        break;
      }
      trade[name] = value;
    }
    if (invalid) continue;
    for (const name of ['setup', 'timeframe', 'session', 'tradingview_url', 'note'] as const) {
      trade[name] = cellText(get(row, name)) || null;
    }
    if (trade.tradingview_url && !/^https?:\/\//i.test(trade.tradingview_url)) {
      result.issues.push({ row: rowNumber, message: 'Link biểu đồ phải bắt đầu bằng http:// hoặc https://.' });
      continue;
    }
    trade.incomplete = !trade.entry_price || !trade.sl_price || !trade.exit_price ||
      !trade.eval_before.length || !trade.eval_during.length || !trade.eval_after.length;
    const externalId = cellText(get(row, 'external_id'));
    trade.mt5_key = makeImportKey('excel', externalId ? [accountId, externalId] :
      [accountId, date, closeTime, trade.symbol, direction, volume, reportedProfit, fee,
        trade.entry_price, trade.sl_price, trade.tp_price, trade.exit_price]);
    if (seen.has(trade.mt5_key)) {
      result.issues.push({ row: rowNumber, message: 'Lệnh trùng trong file/dữ liệu dán; bỏ qua.' });
      continue;
    }
    seen.add(trade.mt5_key);
    result.trades.push({ row: rowNumber, trade, sourceId: trade.mt5_key });
  }
  if (blankFeeCount > 0) {
    result.issues.unshift({ row: headerRow + 1, message: `${blankFeeCount} dòng có ô Fee trống được tính là 0; hãy đối chiếu với file gốc.` });
  }
  if (!result.trades.length && !result.issues.length) {
    result.issues.push({ row: headerRow + 1, message: 'Không có dòng lệnh để nhập.' });
  }
  return result;
}
