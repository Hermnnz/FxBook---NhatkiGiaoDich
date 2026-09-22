import { describe, expect, it } from 'vitest';
import { buildReportAnalytics, filterReportTrades, reportPeriodBounds } from '../report-analytics';
import type { Trade } from '@/types';

function trade(id: string, values: Partial<Trade>): Trade {
  return {
    id, user_id: 'u', account_id: 'a', date: `2026-09-0${id}T10:00:00Z`, close_time: null,
    symbol: 'EURUSD', direction: 'buy', entry_price: null, exit_price: null,
    volume: 1, profit: 0, fee: 0, profit_calc_mode: 'manual', contract_size: null,
    tick_size: null, tick_value: null, conversion_rate: null, fee_calc_mode: 'manual',
    commission_per_lot_round_turn: null, swap_charge: null, theoretical_profit: null,
    risk_amount: null, sl_price: null, tp_price: null, setup: null, timeframe: null,
    session: null, tradingview_url: null, note: null, mt5_key: null, incomplete: false,
    eval_before: [], eval_during: [], eval_after: [], eval_errors: [], eval_errors_reviewed: false,
    created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', ...values,
  };
}

describe('report analytics', () => {
  it('compares actual and theoretical results on exactly the same trades', () => {
    const result = buildReportAnalytics([
      trade('1', { profit: 100, fee: 10, theoretical_profit: 120 }),
      trade('2', { profit: -50, fee: 5 }),
    ]);
    expect(result.comparisonCount).toBe(1);
    expect(result.totalActual).toBe(35);
    expect(result.gross).toEqual({ wins: 100, losses: 50, fees: 15 });
    expect(result.grossProfitFactor).toBe(2);
    expect(result.actualComparisonTotal).toBe(90);
    expect(result.theoreticalTotal).toBe(120);
    expect(result.gap).toBe(-30);
    expect(result.comparison.at(-1)).toMatchObject({ actual: 90, theoretical: 120 });
  });

  it('defaults to a full account history and filters dated periods explicitly', () => {
    const rows = [
      trade('1', { account_id: 'ftmo', date: '2026-09-03T10:00:00Z' }),
      trade('2', { account_id: 'ftmo', date: '2026-09-16T10:00:00Z' }),
      trade('3', { account_id: 'other', date: '2026-09-16T10:00:00Z' }),
    ];
    const now = new Date(2026, 8, 20, 12);
    expect(filterReportTrades(rows, 'ftmo', reportPeriodBounds('all', now))).toHaveLength(2);
    const week = reportPeriodBounds('currentWeek', now);
    expect(week).toMatchObject({ start: '2026-09-14', end: '2026-09-21', cycleType: 'week' });
    expect(filterReportTrades(rows, 'ftmo', week).map((row) => row.id)).toEqual(['2']);
  });

  it('keeps unreviewed trades out of the matrix and groups recorded issues', () => {
    const result = buildReportAnalytics([
      trade('1', { profit: 100, fee: 10, setup: 'Breakout', entry_price: 100, sl_price: 90, tp_price: 120,
        eval_before: ['✓ Đúng kế hoạch'], eval_during: ['✓ Tuân thủ kế hoạch'], eval_after: ['😌 Điềm tĩnh'], eval_errors_reviewed: true }),
      trade('2', { profit: 50, fee: 5, eval_before: ['🤯 FOMO'], eval_during: ['✂️ Cắt lời sớm'], eval_after: ['😰 Lo lắng'], eval_errors: ['Chốt lời quá sớm'], eval_errors_reviewed: true }),
      trade('3', { profit: -20, fee: 2, eval_before: ['✓ Đúng kế hoạch'], eval_during: ['✓ Tuân thủ kế hoạch'], eval_after: ['😌 Điềm tĩnh'] }),
    ]);
    expect(result.reviewedCount).toBe(2);
    expect(result.matrix.correctWin).toHaveLength(1);
    expect(result.matrix.wrongWin).toHaveLength(1);
    expect(result.earlyExitCount).toBe(1);
    expect(result.pareto.before.map((row) => row.name)).toEqual(['FOMO']);
    expect(result.pareto.errors[0].count).toBe(1);
    expect(result.setups[0]).toMatchObject({ name: 'Breakout', rrCount: 1, rrTotal: 2, net: 90 });
  });

  it('does not count imported checklist confirmations or free-text reflections as Pareto problems', () => {
    const result = buildReportAnalytics([trade('1', {
      eval_before: ['Đúng checklist'], eval_during: ['✓ Tuân thủ kế hoạch'],
      eval_after: ['Cần kiên nhẫn hơn khi giao dịch'],
    })]);
    expect(result.pareto.before).toEqual([]);
    expect(result.pareto.during).toEqual([]);
    expect(result.pareto.after).toEqual([]);
  });
});
