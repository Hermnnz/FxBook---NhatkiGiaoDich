/**
 * FxBook — Unit Tests for Core Calculation Engine
 *
 * Tests all formulas from the implementation plan with exact numerical
 * examples documented in the spec.
 */

import { describe, it, expect } from 'vitest';
import {
  netProfit,
  calcCurrentBalance,
  calcStats,
  calcMaxDrawdown,
  calcRMultiple,
  calcRMultiples,
  calcSharpeLikeRatio,
  calcExpectancy,
  calcRecoveryFactor,
  calcWinLossStreaks,
  calcTradeQuadMatrix,
  calcPerformanceScore,
  sortTradesByTime,
  sortTradesDescending,
} from '../calculations';
import type { Trade, Account, AccountTransaction } from '@/types';

// ============================================================
// Helper: create a minimal trade for testing
// ============================================================
function makeTrade(
  overrides: Partial<Trade> & { profit: number; fee: number },
): Trade {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    user_id: 'test-user',
    account_id: 'test-account',
    date: overrides.date ?? '2024-01-01T00:00:00Z',
    close_time: 'close_time' in overrides ? overrides.close_time! : '2024-01-01T01:00:00Z',
    symbol: overrides.symbol ?? 'EURUSD',
    direction: overrides.direction ?? 'buy',
    entry_price: overrides.entry_price ?? null,
    exit_price: overrides.exit_price ?? null,
    volume: overrides.volume ?? 0.1,
    profit: overrides.profit,
    fee: overrides.fee,
    profit_calc_mode: overrides.profit_calc_mode ?? 'manual',
    contract_size: overrides.contract_size ?? null,
    tick_size: overrides.tick_size ?? null,
    tick_value: overrides.tick_value ?? null,
    conversion_rate: overrides.conversion_rate ?? null,
    fee_calc_mode: overrides.fee_calc_mode ?? 'manual',
    commission_per_lot_round_turn: overrides.commission_per_lot_round_turn ?? null,
    swap_charge: overrides.swap_charge ?? null,
    theoretical_profit: overrides.theoretical_profit ?? null,
    risk_amount: overrides.risk_amount ?? null,
    sl_price: overrides.sl_price ?? null,
    tp_price: overrides.tp_price ?? null,
    setup: overrides.setup ?? null,
    timeframe: overrides.timeframe ?? null,
    session: overrides.session ?? null,
    tradingview_url: overrides.tradingview_url ?? null,
    note: overrides.note ?? null,
    mt5_key: overrides.mt5_key ?? null,
    incomplete: overrides.incomplete ?? false,
    eval_before: overrides.eval_before ?? [],
    eval_during: overrides.eval_during ?? [],
    eval_after: overrides.eval_after ?? [],
    eval_errors: overrides.eval_errors ?? [],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

// ============================================================
// 1. NET PROFIT
// ============================================================
describe('netProfit', () => {
  it('calculates net profit for a winning trade', () => {
    // From plan: Profit=+100, Fee=5 → Net Profit = +95
    expect(netProfit({ profit: 100, fee: 5 })).toBe(95);
  });

  it('calculates net profit for a losing trade', () => {
    // From plan: Profit=-50, Fee=3 → Net Profit = -53
    expect(netProfit({ profit: -50, fee: 3 })).toBe(-53);
  });

  it('calculates net profit for a breakeven trade with fee', () => {
    // From plan: Profit=0, Fee=2 → Net Profit = -2
    expect(netProfit({ profit: 0, fee: 2 })).toBe(-2);
  });

  it('handles zero fee', () => {
    expect(netProfit({ profit: 100, fee: 0 })).toBe(100);
  });

  it('adds a signed swap credit to net profit', () => {
    expect(netProfit({ profit: 100, fee: -5 })).toBe(105);
  });
});

// ============================================================
// 2. CURRENT BALANCE
// ============================================================
describe('calcCurrentBalance', () => {
  it('calculates balance with deposits, withdrawals and trades', () => {
    // From plan: initial=10000, deposit=2000, withdrawal=500, totalPnl=+650
    // → 10000 + (2000-500) + 650 = 12150
    const transactions: Pick<AccountTransaction, 'type' | 'amount'>[] = [
      { type: 'deposit', amount: 2000 },
      { type: 'withdrawal', amount: 500 },
    ];
    const trades = [
      { profit: 400, fee: 5 },  // netP = 395
      { profit: 300, fee: 10 }, // netP = 290
      { profit: -30, fee: 5 },  // netP = -35
    ];
    // totalPnl = 395 + 290 + (-35) = 650

    expect(calcCurrentBalance(10000, transactions, trades)).toBe(12150);
  });

  it('calculates balance with no transactions and no trades', () => {
    expect(calcCurrentBalance(10000, [], [])).toBe(10000);
  });

  it('handles multiple deposits and withdrawals', () => {
    const transactions: Pick<AccountTransaction, 'type' | 'amount'>[] = [
      { type: 'deposit', amount: 1000 },
      { type: 'deposit', amount: 500 },
      { type: 'withdrawal', amount: 200 },
    ];
    // netTx = 1000 + 500 - 200 = 1300
    expect(calcCurrentBalance(5000, transactions, [])).toBe(6300);
  });

  it('includes a signed swap credit in account balance', () => {
    expect(calcCurrentBalance(1000, [], [{ profit: 25, fee: -3 }])).toBe(1028);
  });
});

// ============================================================
// 3. TRADE SORTING
// ============================================================
describe('sortTradesByTime', () => {
  it('sorts trades by close_time', () => {
    const trades = [
      makeTrade({ profit: 10, fee: 0, close_time: '2024-01-03T00:00:00Z' }),
      makeTrade({ profit: 20, fee: 0, close_time: '2024-01-01T00:00:00Z' }),
      makeTrade({ profit: 30, fee: 0, close_time: '2024-01-02T00:00:00Z' }),
    ];

    const sorted = sortTradesByTime(trades);
    expect(sorted[0].profit).toBe(20);
    expect(sorted[1].profit).toBe(30);
    expect(sorted[2].profit).toBe(10);
  });

  it('falls back to open date when close_time is null', () => {
    const trades = [
      makeTrade({ profit: 10, fee: 0, date: '2024-01-03T00:00:00Z', close_time: null }),
      makeTrade({ profit: 20, fee: 0, date: '2024-01-01T00:00:00Z', close_time: null }),
    ];

    const sorted = sortTradesByTime(trades);
    expect(sorted[0].profit).toBe(20);
    expect(sorted[1].profit).toBe(10);
  });

  it('does not mutate original array', () => {
    const trades = [
      makeTrade({ profit: 10, fee: 0, close_time: '2024-01-02T00:00:00Z' }),
      makeTrade({ profit: 20, fee: 0, close_time: '2024-01-01T00:00:00Z' }),
    ];

    const sorted = sortTradesByTime(trades);
    expect(sorted).not.toBe(trades);
    expect(trades[0].profit).toBe(10); // original unchanged
  });

  it('feeds streak and drawdown calculations in close-time order after a newest-first fetch', () => {
    const newestFirst = [
      makeTrade({ id: 'third', profit: 100, fee: 0, close_time: '2024-01-03T00:00:00Z' }),
      makeTrade({ id: 'second', profit: -150, fee: 0, close_time: '2024-01-02T00:00:00Z' }),
      makeTrade({ id: 'first', profit: 100, fee: 0, close_time: '2024-01-01T00:00:00Z' }),
    ];
    const chronological = sortTradesByTime(newestFirst);

    expect(chronological.map((trade) => trade.id)).toEqual(['first', 'second', 'third']);
    expect(calcStats(chronological).maxWinStreak).toBe(1);
    expect(calcMaxDrawdown(chronological, 1000).maxDrawdownUsd).toBe(150);
  });

  it('tie-breaks identical time using created_at chronologically', () => {
    const trades = [
      makeTrade({ id: 'late', profit: 50, fee: 0, date: '2024-01-01T12:00:00Z', close_time: '2024-01-01T12:00:00Z', created_at: '2024-01-01T15:00:00Z' }),
      makeTrade({ id: 'early', profit: 20, fee: 0, date: '2024-01-01T12:00:00Z', close_time: '2024-01-01T12:00:00Z', created_at: '2024-01-01T10:00:00Z' }),
    ];
    const sorted = sortTradesByTime(trades);
    expect(sorted.map((t) => t.id)).toEqual(['early', 'late']);
  });
});

describe('sortTradesDescending', () => {
  it('places the most recent trade at the top', () => {
    const trades = [
      makeTrade({ id: 'old', profit: 10, fee: 0, close_time: '2024-01-01T00:00:00Z' }),
      makeTrade({ id: 'newest', profit: 30, fee: 0, close_time: '2024-01-03T00:00:00Z' }),
      makeTrade({ id: 'mid', profit: 20, fee: 0, close_time: '2024-01-02T00:00:00Z' }),
    ];

    const sorted = sortTradesDescending(trades);
    expect(sorted.map((t) => t.id)).toEqual(['newest', 'mid', 'old']);
  });

  it('tie-breaks identical date/time by placing newest created_at at the top', () => {
    const trades = [
      makeTrade({ id: 'first_created', profit: 10, fee: 0, date: '2026-10-26T12:00:00Z', close_time: '2026-10-26T12:00:00Z', created_at: '2026-10-26T06:00:00Z' }),
      makeTrade({ id: 'second_created', profit: 20, fee: 0, date: '2026-10-26T12:00:00Z', close_time: '2026-10-26T12:00:00Z', created_at: '2026-10-26T07:30:00Z' }),
    ];

    const sorted = sortTradesDescending(trades);
    expect(sorted.map((t) => t.id)).toEqual(['second_created', 'first_created']);
  });

  it('does not mutate original array', () => {
    const trades = [
      makeTrade({ id: '1', profit: 10, fee: 0, close_time: '2024-01-01T00:00:00Z' }),
      makeTrade({ id: '2', profit: 20, fee: 0, close_time: '2024-01-02T00:00:00Z' }),
    ];

    const sorted = sortTradesDescending(trades);
    expect(sorted).not.toBe(trades);
    expect(trades[0].id).toBe('1');
  });
});

// ============================================================
// 4. CALC STATS
// ============================================================
describe('calcStats', () => {
  it('returns zero stats for empty trades', () => {
    const stats = calcStats([]);
    expect(stats.totalTrades).toBe(0);
    expect(stats.wins).toBe(0);
    expect(stats.losses).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.profitFactor).toBe(0);
  });

  it('calculates correct stats for mixed trades', () => {
    const trades = [
      { profit: 100, fee: 5 },   // net = +95 (win)
      { profit: -50, fee: 3 },   // net = -53 (loss)
      { profit: 200, fee: 10 },  // net = +190 (win)
      { profit: -30, fee: 2 },   // net = -32 (loss)
      { profit: 0, fee: 0 },     // net = 0 (breakeven)
    ];

    const stats = calcStats(trades);

    expect(stats.totalTrades).toBe(5);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(2);
    expect(stats.breakeven).toBe(1);
    expect(stats.winRate).toBe(40); // 2/5 * 100
    expect(stats.grossWin).toBe(285); // 95 + 190
    expect(stats.grossLoss).toBe(85); // 53 + 32
    expect(stats.totalPnl).toBe(200); // 95 - 53 + 190 - 32 + 0
    expect(stats.largestWin).toBe(190);
    expect(stats.largestLoss).toBe(53);
    expect(stats.avgWin).toBeCloseTo(142.5); // 285 / 2
    expect(stats.avgLoss).toBeCloseTo(42.5); // 85 / 2
  });

  it('calculates profit factor correctly', () => {
    // From plan: Gross Win = 1500, Gross Loss = 1000 → PF = 1.5
    const trades = [
      { profit: 1500, fee: 0 }, // win
      { profit: -1000, fee: 0 }, // loss
    ];
    const stats = calcStats(trades);
    expect(stats.profitFactor).toBeCloseTo(1.5);
  });

  it('returns PF=999 when all wins and no losses', () => {
    const trades = [
      { profit: 100, fee: 0 },
      { profit: 200, fee: 0 },
    ];
    const stats = calcStats(trades);
    expect(stats.profitFactor).toBe(999);
  });

  it('returns PF=0 when no wins and no losses (all breakeven)', () => {
    const trades = [
      { profit: 5, fee: 5 },  // net = 0
      { profit: 3, fee: 3 },  // net = 0
    ];
    const stats = calcStats(trades);
    expect(stats.profitFactor).toBe(0);
  });

  it('breakeven trades do not break win/loss streaks', () => {
    const trades = [
      { profit: 100, fee: 0 },  // net = +100 (win)
      { profit: 200, fee: 0 },  // net = +200 (win)
      { profit: 5, fee: 5 },    // net = 0 (breakeven) — does NOT break win streak
      { profit: 150, fee: 0 },  // net = +150 (win)
    ];
    const stats = calcStats(trades);
    expect(stats.maxWinStreak).toBe(3); // 3 wins, breakeven skipped
  });
});

// ============================================================
// 5. MAX DRAWDOWN
// ============================================================
describe('calcMaxDrawdown', () => {
  it('calculates max drawdown from the implementation plan example', () => {
    // Trade 1: +500 → Cum=500, Peak=500, DD=0
    // Trade 2: -800 → Cum=-300, Peak=500, DD=800
    // Trade 3: +200 → Cum=-100, Peak=500, DD=600
    // → MaxDD = $800 (8.0% of $10,000)
    const trades = [
      { profit: 500, fee: 0 },
      { profit: -800, fee: 0 },
      { profit: 200, fee: 0 },
    ];

    const result = calcMaxDrawdown(trades, 10000);
    expect(result.maxDrawdownUsd).toBe(800);
    expect(result.maxDrawdownPct).toBeCloseTo(8.0);
    expect(result.equityCurve).toEqual([500, -300, -100]);
  });

  it('returns zero drawdown for empty trades', () => {
    const result = calcMaxDrawdown([], 10000);
    expect(result.maxDrawdownUsd).toBe(0);
    expect(result.maxDrawdownPct).toBe(0);
    expect(result.equityCurve).toEqual([]);
  });

  it('returns zero drawdown when all trades are winners', () => {
    const trades = [
      { profit: 100, fee: 0 },
      { profit: 200, fee: 0 },
      { profit: 50, fee: 0 },
    ];
    const result = calcMaxDrawdown(trades, 10000);
    expect(result.maxDrawdownUsd).toBe(0);
  });

  it('handles multiple drawdown periods (picks the worst)', () => {
    const trades = [
      { profit: 100, fee: 0 },   // Cum=100, Peak=100, DD=0
      { profit: -50, fee: 0 },   // Cum=50, Peak=100, DD=50
      { profit: 200, fee: 0 },   // Cum=250, Peak=250, DD=0
      { profit: -300, fee: 0 },  // Cum=-50, Peak=250, DD=300
      { profit: 100, fee: 0 },   // Cum=50, Peak=250, DD=200
    ];
    const result = calcMaxDrawdown(trades, 10000);
    expect(result.maxDrawdownUsd).toBe(300);
  });

  it('handles zero initial balance (MDD% = 0)', () => {
    const trades = [
      { profit: 100, fee: 0 },
      { profit: -200, fee: 0 },
    ];
    const result = calcMaxDrawdown(trades, 0);
    expect(result.maxDrawdownUsd).toBe(200);
    expect(result.maxDrawdownPct).toBe(0);
  });
});

// ============================================================
// 6. R-MULTIPLE
// ============================================================
describe('calcRMultiple', () => {
  const account: Pick<Account, 'initial_balance' | 'risk_pct'> = {
    initial_balance: 10000,
    risk_pct: 1, // 1% = $100 risk per trade
  };

  it('calculates R-Multiple using account risk', () => {
    // NetProfit = 200-0 = 200, RiskUSD = 10000*1/100 = 100
    // R = 200/100 = 2.0
    const trade = { profit: 200, fee: 0, risk_amount: null };
    expect(calcRMultiple(trade, account)).toBeCloseTo(2.0);
  });

  it('calculates R-Multiple with manual risk_amount override', () => {
    // NetProfit = 150-0 = 150, RiskUSD = 50 (manual)
    // R = 150/50 = 3.0
    const trade = { profit: 150, fee: 0, risk_amount: 50 };
    expect(calcRMultiple(trade, account)).toBeCloseTo(3.0);
  });

  it('returns negative R for losing trade', () => {
    // NetProfit = -100-5 = -105, RiskUSD = 100
    // R = -105/100 = -1.05
    const trade = { profit: -100, fee: 5, risk_amount: null };
    expect(calcRMultiple(trade, account)).toBeCloseTo(-1.05);
  });

  it('returns null when risk is zero', () => {
    const zeroRiskAccount = { initial_balance: 0, risk_pct: 0 };
    const trade = { profit: 100, fee: 0, risk_amount: null };
    expect(calcRMultiple(trade, zeroRiskAccount)).toBeNull();
  });
});

describe('calcRMultiples', () => {
  it('returns array of R-Multiples', () => {
    const account = { initial_balance: 10000, risk_pct: 1 };
    const trades = [
      { profit: 200, fee: 0, risk_amount: null },  // R = 2.0
      { profit: -100, fee: 0, risk_amount: null },  // R = -1.0
    ];
    const rMultiples = calcRMultiples(trades, account);
    expect(rMultiples[0]).toBeCloseTo(2.0);
    expect(rMultiples[1]).toBeCloseTo(-1.0);
  });
});

// ============================================================
// 7. SHARPE-LIKE RATIO
// ============================================================
describe('calcSharpeLikeRatio', () => {
  it('calculates Sharpe-like ratio for diverse R values', () => {
    // R = [2.0, -1.0, 1.5, -0.5]
    // mean = (2.0 + (-1.0) + 1.5 + (-0.5)) / 4 = 0.5
    // variance = ((2-0.5)² + (-1-0.5)² + (1.5-0.5)² + (-0.5-0.5)²) / 4
    //          = (2.25 + 2.25 + 1.0 + 1.0) / 4 = 1.625
    // stddev = sqrt(1.625) ≈ 1.2748
    // Sharpe = 0.5 / 1.2748 ≈ 0.3922
    const result = calcSharpeLikeRatio([2.0, -1.0, 1.5, -0.5]);
    expect(result).toBeCloseTo(0.3922, 3);
  });

  it('returns null for empty array', () => {
    expect(calcSharpeLikeRatio([])).toBeNull();
  });

  it('returns null when all R values are identical (stddev=0)', () => {
    expect(calcSharpeLikeRatio([1.0, 1.0, 1.0])).toBeNull();
  });

  it('returns positive Sharpe for consistently winning trader', () => {
    const result = calcSharpeLikeRatio([1.5, 2.0, 1.0, 0.5]);
    expect(result).not.toBeNull();
    expect(result!).toBeGreaterThan(0);
  });

  it('returns negative Sharpe for consistently losing trader', () => {
    const result = calcSharpeLikeRatio([-1.5, -2.0, -1.0, -0.5]);
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(0);
  });
});

// ============================================================
// 8. EXPECTANCY
// ============================================================
describe('calcExpectancy', () => {
  it('calculates USD expectancy', () => {
    // trades net: [+95, -53, +190, -32] = 200 total, 4 trades
    // expectancy = 200/4 = $50
    const trades = [
      { profit: 100, fee: 5 },
      { profit: -50, fee: 3 },
      { profit: 200, fee: 10 },
      { profit: -30, fee: 2 },
    ];
    const result = calcExpectancy(trades);
    expect(result.expectancyUsd).toBeCloseTo(50);
    expect(result.expectancyR).toBeNull();
  });

  it('calculates R expectancy when R-Multiples provided', () => {
    const trades = [{ profit: 100, fee: 0 }];
    const rMultiples = [2.0, -1.0, 1.5];
    const result = calcExpectancy(trades, rMultiples);
    // mean(R) = (2+(-1)+1.5)/3 ≈ 0.833
    expect(result.expectancyR).toBeCloseTo(0.8333, 3);
  });

  it('returns zero for empty trades', () => {
    const result = calcExpectancy([]);
    expect(result.expectancyUsd).toBe(0);
    expect(result.expectancyR).toBeNull();
  });
});

// ============================================================
// 9. RECOVERY FACTOR
// ============================================================
describe('calcRecoveryFactor', () => {
  it('calculates recovery factor correctly', () => {
    // totalPnl = 2000, MDD = 800 → RF = 2.5
    expect(calcRecoveryFactor(2000, 800)).toBeCloseTo(2.5);
  });

  it('returns 0 when MDD is zero', () => {
    expect(calcRecoveryFactor(500, 0)).toBe(0);
  });
});

// ============================================================
// 10. WIN/LOSS STREAKS
// ============================================================
describe('calcWinLossStreaks', () => {
  it('tracks win and loss streaks correctly', () => {
    const trades = [
      { profit: 100, fee: 0 },  // win
      { profit: 200, fee: 0 },  // win
      { profit: 50, fee: 0 },   // win
      { profit: -100, fee: 0 }, // loss
      { profit: -50, fee: 0 },  // loss
      { profit: 100, fee: 0 },  // win
    ];
    const result = calcWinLossStreaks(trades);
    expect(result.maxWinStreak).toBe(3);
    expect(result.maxLossStreak).toBe(2);
  });

  it('breakeven does NOT break win streak', () => {
    const trades = [
      { profit: 100, fee: 0 },  // win
      { profit: 5, fee: 5 },    // breakeven (net=0) — SKIP
      { profit: 200, fee: 0 },  // win
    ];
    const result = calcWinLossStreaks(trades);
    expect(result.maxWinStreak).toBe(2); // win, skip, win = 2 consecutive
  });

  it('breakeven does NOT break loss streak', () => {
    const trades = [
      { profit: -100, fee: 0 }, // loss
      { profit: 3, fee: 3 },    // breakeven (net=0) — SKIP
      { profit: -50, fee: 0 },  // loss
    ];
    const result = calcWinLossStreaks(trades);
    expect(result.maxLossStreak).toBe(2);
  });

  it('returns zero streaks for empty trades', () => {
    const result = calcWinLossStreaks([]);
    expect(result.maxWinStreak).toBe(0);
    expect(result.maxLossStreak).toBe(0);
  });
});

// ============================================================
// 11. TRADE QUAD MATRIX
// ============================================================
describe('calcTradeQuadMatrix', () => {
  it('classifies trades into 4 quadrants', () => {
    const reviewed = { eval_before: ['Kế hoạch'], eval_during: ['Thực thi'], eval_after: ['Đánh giá'] };
    const trades = [
      makeTrade({ ...reviewed, profit: 100, fee: 0, eval_errors: [] }),
      makeTrade({ ...reviewed, profit: -50, fee: 0, eval_errors: [] }),
      makeTrade({ ...reviewed, profit: 80, fee: 0, eval_errors: ['FOMO'] }),
      makeTrade({ ...reviewed, profit: -30, fee: 0, eval_errors: ['Gồng lỗ'] }),
      makeTrade({ ...reviewed, profit: 0, fee: 0, eval_errors: [] }),
      makeTrade({ profit: 200, fee: 0, eval_errors: [] }), // Unreviewed
    ];

    const matrix = calcTradeQuadMatrix(trades);
    expect(matrix.correctWin.length).toBe(1);
    expect(matrix.correctLoss.length).toBe(2); // loss + breakeven
    expect(matrix.wrongWin.length).toBe(1);
    expect(matrix.wrongLoss.length).toBe(1);
  });

  it('does not treat unreviewed trades as error-free', () => {
    const trades = [
      makeTrade({ profit: 100, fee: 0 }), // eval_errors defaults to []
    ];
    const matrix = calcTradeQuadMatrix(trades);
    expect(matrix.correctWin.length).toBe(0);
  });
});

// ============================================================
// 12. PERFORMANCE SCORE
// ============================================================
describe('calcPerformanceScore', () => {
  it('returns expected values for empty trades with zero stats', () => {
    const stats = calcStats([]);
    const score = calcPerformanceScore(stats, 0, []);
    expect(score.profitability).toBe(0);
    expect(score.riskManagement).toBe(0);
    expect(score.consistency).toBe(0);
    expect(score.discipline).toBe(0);
    expect(score.tradeQuality).toBe(0);
    expect(score.psychology).toBe(0);
    expect(score.overall).toBe(0);
  });

  it('gives high profitability for PF >= 2', () => {
    const trades = [makeTrade({ profit: 100, fee: 0 })];
    const stats = calcStats(trades);
    stats.profitFactor = 3.0;
    const score = calcPerformanceScore(stats, 5, trades);
    expect(score.profitability).toBeGreaterThanOrEqual(80);
  });

  it('gives perfect risk management for MDD <= 5%', () => {
    const trades = [makeTrade({ profit: 100, fee: 0 })];
    const stats = calcStats(trades);
    const score = calcPerformanceScore(stats, 3, trades);
    expect(score.riskManagement).toBe(100);
  });

  it('calculates discipline based on error-free trades', () => {
    const reviewed = { eval_before: ['Kế hoạch'], eval_during: ['Thực thi'], eval_after: ['Đánh giá'] };
    const trades = [
      makeTrade({ ...reviewed, profit: 100, fee: 0, eval_errors: [] }),
      makeTrade({ ...reviewed, profit: -50, fee: 0, eval_errors: ['FOMO'] }),
      makeTrade({ ...reviewed, profit: 80, fee: 0, eval_errors: [] }),
      makeTrade({ profit: 80, fee: 0, eval_errors: [] }), // Unknown discipline
    ];
    const stats = calcStats(trades);
    const score = calcPerformanceScore(stats, 5, trades);
    // 2/3 reviewed trades without errors ≈ 66.67%
    expect(score.discipline).toBeCloseTo(66.67, 1);
  });

  it('calculates trade quality based on complete evaluations', () => {
    const trades = [
      makeTrade({
        profit: 100,
        fee: 0,
        eval_before: ['Đúng kế hoạch'],
        eval_during: ['Tuân thủ'],
        eval_after: ['Bình tĩnh'],
      }),
      makeTrade({
        profit: -50,
        fee: 0,
        eval_before: [],
        eval_during: [],
        eval_after: [],
      }),
    ];
    const stats = calcStats(trades);
    const score = calcPerformanceScore(stats, 5, trades);
    // 1/2 trades with complete evals = 50%
    expect(score.tradeQuality).toBeCloseTo(50, 0);
  });

  it('overall is average of all 6 axes', () => {
    const trades = [
      makeTrade({
        profit: 200,
        fee: 0,
        eval_before: ['Đúng kế hoạch'],
        eval_during: ['Tuân thủ'],
        eval_after: ['Bình tĩnh'],
        eval_errors: [],
      }),
    ];
    const stats = calcStats(trades);
    const score = calcPerformanceScore(stats, 5, trades);
    const expectedOverall =
      (score.profitability +
        score.riskManagement +
        score.consistency +
        score.discipline +
        score.tradeQuality +
        score.psychology) /
      6;
    expect(score.overall).toBeCloseTo(expectedOverall, 1);
  });
});
