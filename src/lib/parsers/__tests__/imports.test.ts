// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseCsv, serializeTradesCsv } from '../csv';
import { decodeMt5File, parseMt5Html } from '../mt5';

const accountId = '8f552247-a72d-48cf-b136-cc58463de693';
const header = '<tr><th>Time</th><th>Position</th><th>Symbol</th><th>Type</th><th>Note</th><th>Volume</th><th>Price</th><th>S/L</th><th>T/P</th><th>Time</th><th>Price</th><th>Commission</th><th>Swap</th><th>Profit</th></tr>';
const row = '<tr><td>2026.09.17 09:00:00</td><td>345</td><td>XAUUSD</td><td>Buy</td><td></td><td>0.10</td><td>3650.50</td><td>3640</td><td>3670</td><td>2026.09.17 10:00:00</td><td>3660.50</td><td>-4.00</td><td>-1.00</td><td>100.00</td></tr>';
const html = `<html><body><p>Account: 12345678</p><table><tr><th>Positions</th></tr></table><table>${header}${row}</table></body></html>`;

describe('MT5 importer', () => {
  it('decodes UTF-16LE and UTF-8 BOM', () => {
    const utf16 = new Uint8Array([0xff, 0xfe, ...Array.from(html).flatMap((char) => [char.charCodeAt(0), 0])]);
    const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(html)]);
    expect(decodeMt5File(utf16.buffer)).toBe(html);
    expect(decodeMt5File(utf8.buffer)).toBe(html);
  });

  it('reads a closed position and preserves the net profit calculation', () => {
    const parsed = parseMt5Html(html, { accountId, accountNumber: '12345678', brokerUtcOffsetMinutes: 420 });
    expect(parsed.issues).toEqual([]);
    expect(parsed.trades).toHaveLength(1);
    const trade = parsed.trades[0].trade;
    expect(trade.date).toBe('2026-09-17T02:00:00.000Z');
    expect(trade.close_time).toBe('2026-09-17T03:00:00.000Z');
    expect(trade.entry_price).toBe(3650.5);
    expect(trade.sl_price).toBe(3640);
    expect(trade.tp_price).toBe(3670);
    expect(trade.exit_price).toBe(3660.5);
    expect(trade.profit).toBe(100);
    expect(trade.fee).toBe(5);
    expect(trade.profit - trade.fee).toBe(95);
    expect(trade.mt5_key).toBe('mt5_12345678_345');
    expect(trade.incomplete).toBe(true);
  });

  it('rejects account mismatch and preserves a positive swap credit', () => {
    expect(parseMt5Html(html, { accountId, accountNumber: '98765432', brokerUtcOffsetMinutes: 0 }).trades).toHaveLength(0);
    const positiveSwap = html.replace('<td>-1.00</td>', '<td>1.00</td>');
    const parsed = parseMt5Html(positiveSwap, { accountId, accountNumber: '12345678', brokerUtcOffsetMinutes: 0 });
    expect(parsed.issues).toEqual([]);
    expect(parsed.trades[0].trade.fee).toBe(3);
    expect(parsed.trades[0].trade.profit - parsed.trades[0].trade.fee).toBe(97);
    const netCredit = html.replace('<td>-1.00</td>', '<td>6.00</td>');
    expect(parseMt5Html(netCredit, { accountId, accountNumber: '12345678', brokerUtcOffsetMinutes: 0 }).trades[0].trade.fee).toBe(-2);
  });

  it('does not treat Deals as complete positions', () => {
    const parsed = parseMt5Html(`<table><tr><th>Deals</th></tr>${header}${row}</table>`, { accountId, accountNumber: '12345678', brokerUtcOffsetMinutes: 0 });
    expect(parsed.trades).toHaveLength(0);
  });

  it('rejects repeated position IDs instead of silently dropping a partial close', () => {
    const parsed = parseMt5Html(`<table><tr><th>Positions</th></tr>${header}${row}${row}</table>`, { accountId, accountNumber: '12345678', brokerUtcOffsetMinutes: 0 });
    expect(parsed.trades).toHaveLength(0);
    expect(parsed.issues.some((issue) => issue.message.includes('xuất hiện 2 lần'))).toBe(true);
  });

  it('rejects a reordered Positions table', () => {
    const reversed = header.replace('<th>Commission</th><th>Swap</th>', '<th>Swap</th><th>Commission</th>');
    const parsed = parseMt5Html(`<table><tr><th>Positions</th></tr>${reversed}${row}</table>`, { accountId, accountNumber: '12345678', brokerUtcOffsetMinutes: 0 });
    expect(parsed.trades).toHaveLength(0);
    expect(parsed.issues.some((issue) => issue.message.includes('thứ tự cột'))).toBe(true);
  });

  it('reports invalid non-empty stop prices', () => {
    const badStop = html.replace('<td>3640</td>', '<td>bad</td>');
    const parsed = parseMt5Html(badStop, { accountId, accountNumber: '12345678', brokerUtcOffsetMinutes: 0 });
    expect(parsed.trades).toHaveLength(0);
    expect(parsed.issues.some((issue) => issue.message.includes('sai dữ liệu'))).toBe(true);
  });
});

describe('CSV importer', () => {
  const sample = 'date,close_time,symbol,direction,volume,profit,fee\n2026-09-17T09:00:00+07:00,2026-09-17T10:00:00+07:00,XAUUSD,buy,0.1,100,5\n';
  it('parses canonical CSV and assigns a stable duplicate key', () => {
    const first = parseCsv(sample, accountId);
    const second = parseCsv(sample, accountId);
    expect(first.issues).toEqual([]);
    expect(first.trades).toHaveLength(1);
    expect(first.trades[0].trade.mt5_key).toBe(second.trades[0].trade.mt5_key);
    expect(first.trades[0].trade.profit - first.trades[0].trade.fee).toBe(95);
  });

  it('keeps CSV entry, stop loss, take profit, close price, gross P&L and fee distinct', () => {
    const withPrices = sample.replace('profit,fee', 'profit,fee,entry_price,sl_price,tp_price,exit_price').replace('0.1,100,5', '0.1,100,5,3650.50,3640,3670,3660.50');
    const parsed = parseCsv(withPrices, accountId);
    expect(parsed.issues).toEqual([]);
    expect(parsed.trades[0].trade).toMatchObject({ entry_price: 3650.5, sl_price: 3640, tp_price: 3670, exit_price: 3660.5, profit: 100, fee: 5 });
  });

  it('keeps explicit fee credits and derives signed cost from MT5-style commission and swap', () => {
    const credit = sample.replace('0.1,100,5', '0.1,100,-2');
    expect(parseCsv(credit, accountId).trades[0].trade.fee).toBe(-2);
    const withCashflows = sample.replace('profit,fee', 'profit,commission,swap').replace('0.1,100,5', '0.1,100,-4,6');
    const parsed = parseCsv(withCashflows, accountId);
    expect(parsed.issues).toEqual([]);
    expect(parsed.trades[0].trade.fee).toBe(-2);
    expect(parsed.trades[0].trade.profit - parsed.trades[0].trade.fee).toBe(102);
  });

  it('round-trips exported CSV without losing prices, signed fee or duplicate key', () => {
    const source = sample.replace('profit,fee', 'profit,fee,entry_price,sl_price,tp_price,exit_price,note').replace('0.1,100,5', '0.1,100,-2,3650.50,3640,3670,3660.50,"A, B"');
    const first = parseCsv(source, accountId);
    const exported = serializeTradesCsv(first.trades.map((item) => item.trade));
    const second = parseCsv(exported, accountId);
    expect(second.issues).toEqual([]);
    expect(second.trades).toHaveLength(1);
    expect(second.trades[0].sourceId).toBe(first.trades[0].sourceId);
    expect(second.trades[0].trade).toMatchObject({
      entry_price: 3650.5, sl_price: 3640, tp_price: 3670, exit_price: 3660.5,
      profit: 100, fee: -2, note: 'A, B',
    });
  });

  it('reports bad rows and missing required headers without importing them', () => {
    expect(parseCsv('symbol,profit\nXAUUSD,100', accountId).trades).toHaveLength(0);
    const invalid = sample.replace('0.1,100,5', 'nope,100,5');
    expect(parseCsv(invalid, accountId).trades).toHaveLength(0);
    expect(parseCsv(invalid, accountId).issues[0].row).toBe(2);
  });

  it('rejects invalid optional numbers and close times before open times', () => {
    const withOptional = `${sample.trimEnd().replace('profit,fee', 'profit,fee,entry_price').replace('0.1,100,5', '0.1,100,5,invalid')}\n`;
    expect(parseCsv(withOptional, accountId).trades).toHaveLength(0);
    const reversed = sample.replace('2026-09-17T10:00:00+07:00', '2026-09-17T08:00:00+07:00');
    expect(parseCsv(reversed, accountId).issues[0].message).toContain('trước date');
    expect(parseCsv(sample.replace('2026-09-17T09:00:00+07:00', '2026-02-30T09:00:00+07:00'), accountId).trades).toHaveLength(0);
  });
});
