import { describe, expect, it } from 'vitest';
import { read, utils, write } from 'xlsx';
import { excelAccountLabels, findExcelHeader, parseExcelRows, type ExcelRows } from '../parsers/excel';

const accountA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const accountB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const options = {
  defaultAccountId: accountA,
  accountMap: { FTMO: accountA, Personal: accountB },
  utcOffsetMinutes: 420,
  profitMeaning: 'net' as const,
  commissionMeaning: 'cash_flow' as const,
};

describe('legacy Excel import', () => {
  it('reads an actual XLSX Trade sheet and maps accounts, Excel dates, signed fees and prices', () => {
    const serial = (Date.UTC(2026, 8, 18) - Date.UTC(1899, 11, 30)) / 86_400_000;
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([
      ['Account', 'Day', 'Symbol', 'L/S', 'Lot', 'Net Profit', 'Fee', 'Entry', 'Stop Loss', 'Take Profit', 'Close Price'],
      ['FTMO', serial, 'XAUUSD', 'Long', 0.1, 95, 5, 3650, 3640, 3670, 3660],
      ['Personal', serial, 'EURUSD', 'Short', 0.2, -52, 2, 1.1, 1.11, '', 1.105],
    ]), 'Trade');
    const bytes = write(workbook, { type: 'array', bookType: 'xlsx' });
    const restored = read(bytes, { type: 'array', cellDates: false });
    const rows = utils.sheet_to_json<ExcelRows[number]>(restored.Sheets.Trade, { header: 1, raw: true, defval: '' });
    expect(findExcelHeader(rows)).toBe(0);
    expect(excelAccountLabels(rows)).toEqual(['FTMO', 'Personal']);
    const parsed = parseExcelRows(rows, options);
    expect(parsed.issues).toEqual([]);
    expect(parsed.trades).toHaveLength(2);
    expect(parsed.trades[0].trade.account_id).toBe(accountA);
    expect(parsed.trades[0].trade.date).toBe('2026-09-17T17:00:00.000Z');
    expect(parsed.trades[0].trade.profit).toBe(100);
    expect(parsed.trades[0].trade.fee).toBe(5);
    expect(parsed.trades[0].trade.sl_price).toBe(3640);
    expect(parsed.trades[0].trade.tp_price).toBe(3670);
    expect(parsed.trades[0].trade.exit_price).toBe(3660);
    expect(parsed.trades[1].trade.account_id).toBe(accountB);
    expect(parsed.trades[1].trade.profit).toBe(-50);
    expect(parsed.trades[1].trade.tp_price).toBeNull();
  });

  it('parses pasted tabular data with day-first dates and avoids duplicate rows', () => {
    const rows: ExcelRows = [
      ['Account', 'Day', 'Symbol', 'Direction', 'Volume', 'Profit', 'Commission', 'Swap'],
      ['FTMO', '18/09/2026 09:30', 'XAUUSD', 'Buy', '0.1', '100', '-5', '2'],
      ['FTMO', '18/09/2026 09:30', 'XAUUSD', 'Buy', '0.1', '100', '-5', '2'],
    ];
    const parsed = parseExcelRows(rows, { ...options, profitMeaning: 'gross' });
    expect(parsed.trades).toHaveLength(1);
    expect(parsed.trades[0].trade.date).toBe('2026-09-18T02:30:00.000Z');
    expect(parsed.trades[0].trade.fee).toBe(3);
    expect(parsed.trades[0].trade.profit).toBe(100);
    expect(parsed.issues.some((issue) => issue.message.includes('trùng'))).toBe(true);
  });

  it('reads a legacy XLS workbook with the same column mapping', () => {
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([
      ['Account', 'Day', 'Symbol', 'L/S', 'Lot', 'Profit', 'Fee'],
      ['FTMO', '18/09/2026', 'GBPUSD', 'Sell', 0.2, 40, 1],
    ]), 'Trade');
    const bytes = write(workbook, { type: 'array', bookType: 'biff8' });
    const restored = read(bytes, { type: 'array' });
    const rows = utils.sheet_to_json<ExcelRows[number]>(restored.Sheets.Trade, { header: 1, raw: true, defval: '' });
    const parsed = parseExcelRows(rows, options);
    expect(parsed.trades).toHaveLength(1);
    expect(parsed.trades[0].trade.symbol).toBe('GBPUSD');
    expect(parsed.trades[0].trade.direction).toBe('sell');
    expect(parsed.trades[0].trade.profit - parsed.trades[0].trade.fee).toBe(40);
  });

  it('does not invent an account, volume or price when source data is incomplete', () => {
    const rows: ExcelRows = [
      ['Account', 'Day', 'Symbol', 'Direction', 'Profit', 'Entry'],
      ['Unknown', '18/09/2026', 'EURUSD', 'Sell', '20', '1.1'],
    ];
    expect(parseExcelRows(rows, options).trades).toHaveLength(0);
    const withVolume = parseExcelRows(rows, { ...options, defaultVolume: 0.1 });
    expect(withVolume.trades).toHaveLength(0); // Unmapped account
    const mapped = parseExcelRows(rows, { ...options, defaultVolume: 0.1, accountMap: { Unknown: accountA } });
    expect(mapped.trades).toHaveLength(1);
    expect(mapped.trades[0].trade.sl_price).toBeNull();
    expect(mapped.trades[0].trade.incomplete).toBe(true);
    expect(mapped.issues.some((issue) => issue.message.includes('phí'))).toBe(true);
  });

  it('keeps a reported net amount when a Fee cell is blank and warns about the assumption', () => {
    const rows: ExcelRows = [
      ['Account', 'Day', 'Symbol', 'Direction', 'Volume', 'Profit', 'Fee'],
      ['FTMO', '18/09/2026', 'XAUUSD', 'Buy', '0.1', '25', ''],
    ];
    const parsed = parseExcelRows(rows, options);
    expect(parsed.trades).toHaveLength(1);
    expect(parsed.trades[0].trade.profit).toBe(25);
    expect(parsed.trades[0].trade.fee).toBe(0);
    expect(parsed.issues[0].message).toContain('Fee trống');
  });
});
