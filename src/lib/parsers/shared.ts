import type { TradeInsert } from '@/types';

export type ImportIssue = { row: number; message: string };
export type ParsedTrade = { row: number; trade: TradeInsert; sourceId: string };
export type ParseResult = {
  trades: ParsedTrade[];
  issues: ImportIssue[];
  accountNumber?: string;
  reportedBalance?: number;
  format: 'mt5' | 'csv' | 'excel';
};

export function parseNumber(value: string): number | null {
  let clean = value.trim().replace(/[\s\u00a0'’$€£]/g, '');
  if (!clean || clean === '—' || clean === '-') return null;
  const negative = /^\(.*\)$/.test(clean);
  clean = clean.replace(/[()]/g, '');
  const comma = clean.lastIndexOf(',');
  const dot = clean.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    clean = comma > dot ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/,/g, '');
  } else if (comma >= 0) {
    clean = /,\d{1,2}$/.test(clean) ? clean.replace(',', '.') : clean.replace(/,/g, '');
  }
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
}

export function parseTimestamp(value: string, offsetMinutes?: number): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:?\d\d)$/i.test(raw)) {
    const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i);
    if (!parts) return null;
    const [, year, month, day, hour, minute, second] = parts;
    const calendar = new Date(Date.UTC(+year, +month - 1, +day));
    if (calendar.getUTCFullYear() !== +year || calendar.getUTCMonth() !== +month - 1 || calendar.getUTCDate() !== +day || +hour > 23 || +minute > 59 || +(second ?? 0) > 59) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (offsetMinutes === undefined) return null;
  const match = raw.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)) - offsetMinutes * 60_000;
  const date = new Date(utc);
  if (Number.isNaN(utc)) return null;
  const check = new Date(utc + offsetMinutes * 60_000);
  if (check.getUTCFullYear() !== +y || check.getUTCMonth() !== +mo - 1 || check.getUTCDate() !== +d || check.getUTCHours() !== +h || check.getUTCMinutes() !== +mi) return null;
  return date.toISOString();
}

export function blankTrade(accountId: string): TradeInsert {
  return {
    account_id: accountId, date: '', close_time: null, symbol: '', direction: 'buy',
    entry_price: null, exit_price: null, volume: 0, profit: 0, fee: 0,
    theoretical_profit: null, risk_amount: null, sl_price: null, tp_price: null,
    setup: null, timeframe: null, session: null, tradingview_url: null,
    note: null, mt5_key: null, incomplete: true,
    eval_before: [], eval_during: [], eval_after: [], eval_errors: [],
  };
}

export function makeImportKey(prefix: string, values: unknown[]): string {
  // Stable, compact identifier. The database unique index is the final guard on retry/races.
  const serialized = JSON.stringify(values);
  let first = 2166136261;
  let second = 2166136261;
  for (let i = 0; i < serialized.length; i++) {
    const code = serialized.charCodeAt(i);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ (code + i), 2246822519);
  }
  return `${prefix}_${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}
