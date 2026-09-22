/**
 * FxBook — Core Financial Calculation Engine
 *
 * ALL screens (Dashboard, Report, Statistics) MUST use this shared engine.
 * Formulas are derived from the reference implementation at nhatky.phamduydinh.com
 * and standardized in the implementation plan.
 *
 * @module calculations
 */

import type {
  Trade,
  Account,
  AccountTransaction,
  TradeStats,
  DrawdownResult,
  ExpectancyResult,
  PerformanceScore,
  TradeQuadMatrix,
} from '@/types';

// ============================================================
// 1. NET PROFIT
// ============================================================

/**
 * Calculate net profit for a single trade.
 *
 * Formula: Net Profit = Profit - Fee.
 * Fee is a signed net cost: positive charges reduce P&L, negative swap credits increase it.
 *
 * Examples:
 *   - Win:  profit=+100, fee=5  → netProfit = +95
 *   - Loss: profit=-50,  fee=3  → netProfit = -53
 *   - BE:   profit=0,    fee=2  → netProfit = -2
 *   - Credit: profit=100, fee=-5 → netProfit = +105
 */
export function netProfit(trade: Pick<Trade, 'profit' | 'fee'>): number {
  return trade.profit - trade.fee;
}

// ============================================================
// 2. CURRENT BALANCE
// ============================================================

/**
 * Calculate current account balance (ALWAYS derived, never stored).
 *
 * Formula: Current Balance = Initial Balance + Σ(Deposits - Withdrawals) + Σ Net Profit
 *
 * Example:
 *   initialBalance=10000, deposits=[2000], withdrawals=[500], totalPnl=+650
 *   → 10000 + (2000 - 500) + 650 = 12150
 */
export function calcCurrentBalance(
  initialBalance: number,
  transactions: Pick<AccountTransaction, 'type' | 'amount'>[],
  trades: Pick<Trade, 'profit' | 'fee'>[],
): number {
  const netTransactions = transactions.reduce((sum, tx) => {
    return sum + (tx.type === 'deposit' ? tx.amount : -tx.amount);
  }, 0);

  const totalPnl = trades.reduce((sum, t) => sum + netProfit(t), 0);

  return initialBalance + netTransactions + totalPnl;
}

// ============================================================
// 3. TRADE SORTING
// ============================================================

/**
 * Sort trades by close time (or open date as fallback), then by id.
 * Matches the reference implementation's compareTradeTime logic.
 */
export function sortTradesByTime(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => {
    const timeA = a.close_time || a.date;
    const timeB = b.close_time || b.date;
    if (timeA < timeB) return -1;
    if (timeA > timeB) return 1;
    // Tie-break by id for deterministic ordering
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ============================================================
// 4. CORE STATS (Win Rate, Profit Factor, Streaks, etc.)
// ============================================================

/**
 * Calculate comprehensive trade statistics.
 *
 * Win/Loss classification:
 *   - Win:      netProfit > 0
 *   - Loss:     netProfit < 0
 *   - Breakeven: netProfit === 0
 *
 * Profit Factor:
 *   - grossLoss > 0:  PF = grossWin / grossLoss
 *   - grossLoss = 0 && grossWin > 0: PF = 999 (infinity)
 *   - grossLoss = 0 && grossWin = 0: PF = 0
 *
 * Streaks:
 *   - p > 0 increments win streak
 *   - p < 0 increments loss streak
 *   - p === 0 (breakeven) is SKIPPED (does not break streaks)
 */
export function calcStats(trades: Pick<Trade, 'profit' | 'fee'>[]): TradeStats {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      breakeven: 0,
      winRate: 0,
      grossWin: 0,
      grossLoss: 0,
      totalPnl: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      maxWinStreak: 0,
      maxLossStreak: 0,
    };
  }

  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let totalPnl = 0;
  let largestWin = 0;
  let largestLoss = 0;

  // Streak tracking
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;

  for (const trade of trades) {
    const np = netProfit(trade);
    totalPnl += np;

    if (np > 0) {
      wins++;
      grossWin += np;
      if (np > largestWin) largestWin = np;

      // Streak: win resets loss streak
      currentWinStreak++;
      currentLossStreak = 0;
      if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
    } else if (np < 0) {
      losses++;
      grossLoss += Math.abs(np);
      if (Math.abs(np) > largestLoss) largestLoss = Math.abs(np);

      // Streak: loss resets win streak
      currentLossStreak++;
      currentWinStreak = 0;
      if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
    } else {
      // Breakeven (np === 0): counted but does NOT break streaks
      breakeven++;
    }
  }

  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  // Profit Factor with edge cases
  let profitFactor: number;
  if (grossLoss > 0) {
    profitFactor = grossWin / grossLoss;
  } else if (grossWin > 0) {
    profitFactor = 999; // Infinity representation
  } else {
    profitFactor = 0;
  }

  return {
    totalTrades,
    wins,
    losses,
    breakeven,
    winRate,
    grossWin,
    grossLoss,
    totalPnl,
    profitFactor,
    avgWin: wins > 0 ? grossWin / wins : 0,
    avgLoss: losses > 0 ? grossLoss / losses : 0,
    largestWin,
    largestLoss,
    maxWinStreak,
    maxLossStreak,
  };
}

// ============================================================
// 5. MAX DRAWDOWN
// ============================================================

/**
 * Calculate max drawdown from a time-sorted series of trades.
 *
 * Algorithm:
 *   1. Compute cumulative P&L: Cum(t) = Σ netProfit(i) for i=1..t
 *   2. Track peak: Peak(t) = max(Cum(1..t))
 *   3. Drawdown(t) = Peak(t) - Cum(t)
 *   4. MaxDrawdown = max(Drawdown(t))
 *
 * Example (from implementation plan):
 *   Trade 1: +500 → Cum=500, Peak=500, DD=0
 *   Trade 2: -800 → Cum=-300, Peak=500, DD=800
 *   Trade 3: +200 → Cum=-100, Peak=500, DD=600
 *   → MaxDD = $800 (8.0% of $10,000 initial balance)
 *
 * IMPORTANT: Trades must be pre-sorted by time before calling this function.
 */
export function calcMaxDrawdown(
  trades: Pick<Trade, 'profit' | 'fee'>[],
  initialBalance: number,
): DrawdownResult {
  if (trades.length === 0) {
    return { maxDrawdownUsd: 0, maxDrawdownPct: 0, equityCurve: [] };
  }

  const equityCurve: number[] = [];
  let cumPnl = 0;
  let peak = 0;
  let maxDrawdownUsd = 0;

  for (const trade of trades) {
    cumPnl += netProfit(trade);
    equityCurve.push(cumPnl);

    if (cumPnl > peak) {
      peak = cumPnl;
    }

    const drawdown = peak - cumPnl;
    if (drawdown > maxDrawdownUsd) {
      maxDrawdownUsd = drawdown;
    }
  }

  const maxDrawdownPct =
    initialBalance > 0 ? (maxDrawdownUsd / initialBalance) * 100 : 0;

  return { maxDrawdownUsd, maxDrawdownPct, equityCurve };
}

// ============================================================
// 6. R-MULTIPLE
// ============================================================

/**
 * Calculate R-Multiple for a single trade.
 *
 * R-Multiple = Net Profit / risk amount in the selected account currency.
 *
 * Risk amount determination:
 *   1. If trade has risk_amount (manual or calculated from Entry and Stop Loss) → use it
 *   2. Otherwise → estimate from account.initial_balance × account.risk_pct / 100
 * The fallback is an estimate, not the actual loss at Stop Loss.
 */
export function calcRMultiple(
  trade: Pick<Trade, 'profit' | 'fee' | 'risk_amount'>,
  account: Pick<Account, 'initial_balance' | 'risk_pct'>,
): number | null {
  const riskAmount = trade.risk_amount ?? (account.initial_balance * account.risk_pct) / 100;

  if (riskAmount <= 0) return null;

  return netProfit(trade) / riskAmount;
}

/**
 * Calculate R-Multiples for an array of trades.
 * Returns null entries for trades where R cannot be computed.
 */
export function calcRMultiples(
  trades: Pick<Trade, 'profit' | 'fee' | 'risk_amount'>[],
  account: Pick<Account, 'initial_balance' | 'risk_pct'>,
): (number | null)[] {
  return trades.map((t) => calcRMultiple(t, account));
}

// ============================================================
// 7. SHARPE-LIKE RATIO
// ============================================================

/**
 * Calculate Sharpe-like ratio from R-Multiples.
 *
 * Formula: Sharpe = mean(R) / stddev(R)
 * Uses population standard deviation (divide by n, NOT n-1).
 *
 * Returns null when:
 *   - No R-multiples available (n = 0)
 *   - Standard deviation = 0 (all R values identical)
 */
export function calcSharpeLikeRatio(rMultiples: number[]): number | null {
  if (rMultiples.length === 0) return null;

  const n = rMultiples.length;
  const mean = rMultiples.reduce((sum, r) => sum + r, 0) / n;

  // Population standard deviation (divide by n)
  const variance =
    rMultiples.reduce((sum, r) => sum + (r - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  if (stddev === 0) return null;

  return mean / stddev;
}

// ============================================================
// 8. EXPECTANCY
// ============================================================

/**
 * Calculate expectancy per trade.
 *
 * Expectancy ($) = Total PnL / Total Trades
 * Expectancy (R) = mean(R-Multiples) — if available
 *
 * When totalTrades = 0: returns $0 / null
 */
export function calcExpectancy(
  trades: Pick<Trade, 'profit' | 'fee'>[],
  rMultiples?: number[],
): ExpectancyResult {
  if (trades.length === 0) {
    return { expectancyUsd: 0, expectancyR: null };
  }

  const totalPnl = trades.reduce((sum, t) => sum + netProfit(t), 0);
  const expectancyUsd = totalPnl / trades.length;

  let expectancyR: number | null = null;
  if (rMultiples && rMultiples.length > 0) {
    expectancyR = rMultiples.reduce((sum, r) => sum + r, 0) / rMultiples.length;
  }

  return { expectancyUsd, expectancyR };
}

// ============================================================
// 9. RECOVERY FACTOR
// ============================================================

/**
 * Recovery Factor = Total Net Profit / Max Drawdown
 * Returns 0 if MaxDrawdown = 0.
 */
export function calcRecoveryFactor(totalPnl: number, maxDrawdownUsd: number): number {
  if (maxDrawdownUsd <= 0) return 0;
  return totalPnl / maxDrawdownUsd;
}

// ============================================================
// 10. WIN/LOSS STREAKS (standalone helper)
// ============================================================

/**
 * Calculate win/loss streaks from time-sorted trades.
 *
 * Rules (from reference source):
 *   - netProfit > 0 → increments win streak, resets loss streak
 *   - netProfit < 0 → increments loss streak, resets win streak
 *   - netProfit === 0 (breakeven) → SKIPPED, does not break either streak
 */
export function calcWinLossStreaks(
  trades: Pick<Trade, 'profit' | 'fee'>[],
): { maxWinStreak: number; maxLossStreak: number } {
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;

  for (const trade of trades) {
    const np = netProfit(trade);

    if (np > 0) {
      currentWinStreak++;
      currentLossStreak = 0;
      if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
    } else if (np < 0) {
      currentLossStreak++;
      currentWinStreak = 0;
      if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
    }
    // np === 0: breakeven, skip — do not reset either streak
  }

  return { maxWinStreak, maxLossStreak };
}

// ============================================================
// 11. TRADE QUAD MATRIX (4-group classification)
// ============================================================

/**
 * Classify trades into 4 quadrants based on decision quality and outcome.
 *
 * Decision quality is only known after all three evaluation stages are filled.
 *   - "Correct" = reviewed trade has NO recorded discipline errors
 *   - "Wrong"   = reviewed trade has at least one recorded discipline error
 *
 * Outcome:
 *   - "Win"  = netProfit > 0
 *   - "Loss" = netProfit <= 0
 *
 * Quadrants:
 *   - Đúng-Lãi (Correct + Win): Following rules and profitable
 *   - Đúng-Lỗ (Correct + Loss): Following rules but losing (acceptable)
 *   - Sai-Lãi (Wrong + Win): Breaking rules but profitable (dangerous)
 *   - Sai-Lỗ (Wrong + Loss): Breaking rules and losing (worst outcome)
 */
export function calcTradeQuadMatrix(trades: Trade[]): TradeQuadMatrix {
  const result: TradeQuadMatrix = {
    correctWin: [],
    correctLoss: [],
    wrongWin: [],
    wrongLoss: [],
  };

  for (const trade of trades) {
    if (!hasCompleteTradeEvaluation(trade)) continue;
    const np = netProfit(trade);
    const isCorrect = !trade.eval_errors || trade.eval_errors.length === 0;
    const isWin = np > 0;

    if (isCorrect && isWin) {
      result.correctWin.push(trade);
    } else if (isCorrect && !isWin) {
      result.correctLoss.push(trade);
    } else if (!isCorrect && isWin) {
      result.wrongWin.push(trade);
    } else {
      result.wrongLoss.push(trade);
    }
  }

  return result;
}

export function hasCompleteTradeEvaluation(trade: Trade): boolean {
  return (trade.eval_before?.length ?? 0) > 0 &&
    (trade.eval_during?.length ?? 0) > 0 &&
    (trade.eval_after?.length ?? 0) > 0;
}

// ============================================================
// 12. PERFORMANCE SCORE (6-axis Radar)
// ============================================================

/**
 * Calculate 6-axis performance score for radar chart visualization.
 *
 * Axes (each 0-100):
 *   1. Profitability:    Based on Profit Factor
 *   2. Risk Management:  Based on Max Drawdown %
 *   3. Consistency:      Based on Win Rate
 *   4. Discipline:       Based on reviewed trades without recorded errors
 *   5. Trade Quality:    Based on completeness (% trades with full evaluation data)
 *   6. Psychology:       Based on emotional control (eval_after analysis)
 *
 * Overall = average of all 6 axes
 */
export function calcPerformanceScore(
  stats: TradeStats,
  maxDrawdownPct: number,
  trades: Trade[],
): PerformanceScore {
  if (trades.length === 0) {
    return { profitability: 0, riskManagement: 0, consistency: 0,
      discipline: 0, tradeQuality: 0, psychology: 0, overall: 0 };
  }
  // 1. Profitability: PF-based scaling
  //    PF < 1 → 0-40, PF 1-2 → 40-80, PF > 2 → 80-100
  let profitability: number;
  if (stats.profitFactor >= 999) {
    profitability = 100;
  } else if (stats.profitFactor >= 2) {
    profitability = Math.min(80 + (stats.profitFactor - 2) * 10, 100);
  } else if (stats.profitFactor >= 1) {
    profitability = 40 + (stats.profitFactor - 1) * 40;
  } else {
    profitability = Math.max(stats.profitFactor * 40, 0);
  }

  // 2. Risk Management: Based on max drawdown %
  //    DD < 5% → 100, DD 5-10% → 80-100, DD 10-20% → 50-80, DD > 30% → 0-30
  let riskManagement: number;
  if (maxDrawdownPct <= 5) {
    riskManagement = 100;
  } else if (maxDrawdownPct <= 10) {
    riskManagement = 100 - (maxDrawdownPct - 5) * 4; // 80-100
  } else if (maxDrawdownPct <= 20) {
    riskManagement = 80 - (maxDrawdownPct - 10) * 3; // 50-80
  } else if (maxDrawdownPct <= 30) {
    riskManagement = 50 - (maxDrawdownPct - 20) * 3; // 20-50
  } else {
    riskManagement = Math.max(20 - (maxDrawdownPct - 30), 0);
  }

  // 3. Consistency: Based on win rate
  //    WR < 30% → 0-30, WR 30-50% → 30-60, WR 50-70% → 60-90, WR > 70% → 90-100
  let consistency: number;
  if (stats.winRate >= 70) {
    consistency = Math.min(90 + (stats.winRate - 70) / 3, 100);
  } else if (stats.winRate >= 50) {
    consistency = 60 + (stats.winRate - 50) * 1.5;
  } else if (stats.winRate >= 30) {
    consistency = 30 + (stats.winRate - 30) * 1.5;
  } else {
    consistency = stats.winRate;
  }

  // 4. Discipline: % of reviewed trades without recorded errors
  const reviewedTrades = trades.filter(hasCompleteTradeEvaluation);
  const tradesWithErrors = reviewedTrades.filter(
    (t) => t.eval_errors && t.eval_errors.length > 0,
  ).length;
  const discipline =
    reviewedTrades.length > 0
      ? ((reviewedTrades.length - tradesWithErrors) / reviewedTrades.length) * 100
      : 0;

  // 5. Trade Quality: % of trades with complete evaluation data
  //    (has at least 1 eval_before AND 1 eval_during AND 1 eval_after)
  const completeTrades = reviewedTrades.length;
  const tradeQuality =
    trades.length > 0 ? (completeTrades / trades.length) * 100 : 0;

  // 6. Psychology: Based on positive post-trade emotions ratio
  //    Positive emotions: "Bình tĩnh", "Tự tin quá mức" (partially positive)
  //    Negative: "Lo lắng", "Tức giận", "Muốn trả thù", "Hối tiếc"
  const positiveAfterTags = new Set(['Bình tĩnh']);
  let totalAfterTags = 0;
  let positiveCount = 0;
  for (const trade of trades) {
    if (trade.eval_after && trade.eval_after.length > 0) {
      for (const tag of trade.eval_after) {
        totalAfterTags++;
        if (positiveAfterTags.has(tag)) {
          positiveCount++;
        }
      }
    }
  }
  const psychology =
    totalAfterTags > 0 ? (positiveCount / totalAfterTags) * 100 : 0;

  const overall =
    (profitability +
      riskManagement +
      consistency +
      discipline +
      tradeQuality +
      psychology) /
    6;

  return {
    profitability: Math.round(profitability * 100) / 100,
    riskManagement: Math.round(riskManagement * 100) / 100,
    consistency: Math.round(consistency * 100) / 100,
    discipline: Math.round(discipline * 100) / 100,
    tradeQuality: Math.round(tradeQuality * 100) / 100,
    psychology: Math.round(psychology * 100) / 100,
    overall: Math.round(overall * 100) / 100,
  };
}

// ============================================================
// 12. THEORETICAL PROFIT (PTH - Planned / Perfect Execution)
// ============================================================

/**
 * Calculate theoretical profit (P&L lý thuyết) if the trade reached TP as planned.
 * Formula: (TP - Entry) * DirectionSide * ContractMultiplier * Volume - Fee
 * - Gold (XAUUSD, XAUUSDT): multiplier = 100
 * - Crypto (BTC, ETH): multiplier = 1
 * - Indices (US30, NAS100): multiplier = 1
 * - Standard Forex: multiplier = 100,000
 */
export function calcTheoreticalProfit(params: {
  symbol: string;
  direction: 'buy' | 'sell' | string;
  entryPrice: number | null | undefined;
  tpPrice: number | null | undefined;
  volume: number | null | undefined;
  fee?: number | null;
}): number | null {
  const { symbol, direction, entryPrice, tpPrice, volume, fee = 0 } = params;
  if (
    entryPrice == null ||
    tpPrice == null ||
    !volume ||
    volume <= 0 ||
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(tpPrice) ||
    !Number.isFinite(volume)
  ) {
    return null;
  }

  const sym = (symbol || '').toUpperCase();
  let mult = 100; // default for Gold (XAUUSD, XAUUSDT)
  if (sym.includes('XAU') || sym.includes('GOLD')) {
    mult = 100;
  } else if (sym.includes('BTC') || sym.includes('ETH')) {
    mult = 1;
  } else if (
    sym.includes('US30') ||
    sym.includes('DJ30') ||
    sym.includes('NAS') ||
    sym.includes('SPX') ||
    sym.includes('GER') ||
    sym.includes('DAX')
  ) {
    mult = 1;
  } else {
    // Standard Forex
    mult = 100000;
  }

  const side = direction.toLowerCase() === 'buy' ? 1 : -1;
  const move = side * (tpPrice - entryPrice);
  const netTheory = move * volume * mult - (fee || 0);
  return Math.round(netTheory * 100) / 100;
}

