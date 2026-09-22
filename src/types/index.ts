// ============================================================
// Database Row Types (matching Supabase schema exactly)
// ============================================================

export interface Account {
  id: string;
  user_id: string;
  name: string;
  initial_balance: number;
  risk_pct: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AccountTransaction {
  id: string;
  user_id: string;
  account_id: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  note: string | null;
  date: string;
  created_at: string;
}

export interface Trade {
  id: string;
  user_id: string;
  account_id: string;
  date: string; // ISO timestamp of open time
  close_time: string | null; // ISO timestamp of close time
  symbol: string;
  direction: 'buy' | 'sell';
  entry_price: number | null;
  exit_price: number | null;
  volume: number;
  profit: number; // gross profit from MT5
  fee: number; // signed net cost: positive charge, negative credit; net P&L = profit - fee
  profit_calc_mode: 'manual' | 'contract' | 'tick';
  contract_size: number | null; // units per lot in the instrument's P&L currency
  tick_size: number | null;
  tick_value: number | null; // value per tick per lot in the instrument's P&L currency
  conversion_rate: number | null; // explicit P&L-currency to account-currency multiplier
  fee_calc_mode: 'manual' | 'per_lot';
  commission_per_lot_round_turn: number | null; // account currency, positive cost
  swap_charge: number | null; // signed net cost in account currency
  theoretical_profit: number | null; // what P&L would have been with perfect execution
  risk_amount: number | null; // risk at SL or manual override in the account currency
  sl_price: number | null;
  tp_price: number | null;
  setup: string | null;
  timeframe: string | null;
  session: string | null;
  tradingview_url: string | null;
  note: string | null;
  mt5_key: string | null; // MT5 dedup key: accountNumber_positionId
  incomplete: boolean;
  eval_before: string[]; // evaluation tags before trade
  eval_during: string[]; // evaluation tags during trade
  eval_after: string[]; // evaluation tags after trade
  eval_errors: string[]; // discipline error tags
  eval_errors_reviewed?: boolean; // explicit confirmation that the error checklist was reviewed
  created_at: string;
  updated_at: string;
}

export interface MarketAnalysis {
  id: string;
  user_id: string;
  account_id: string | null;
  date: string;
  symbol: string;
  direction: 'buy' | 'sell' | null;
  timeframe: string | null;
  setup: string | null;
  entry_zone: string | null;
  sl_zone: string | null;
  tp_zones: string | null;
  lot_size: number | null;
  risk_usd: number | null;
  risk_reward: number | null;
  tradingview_url: string | null;
  notes: string | null;
  status: 'pending' | 'executed' | 'cancelled' | 'missed';
  created_at: string;
  updated_at: string;
}

export interface ReadinessCheck {
  id: string;
  user_id: string;
  date: string;
  physical_score: number; // 0-2
  mental_score: number; // 0-2
  market_score: number; // 0-2
  plan_score: number; // 0-2
  discipline_score: number; // 0-2
  total_score: number; // 0-10 (generated)
  notes: string | null;
  created_at: string;
}

export interface PlaybookEntry {
  id: string;
  user_id: string;
  type: 'philosophy' | 'rule' | 'setup';
  title: string;
  content: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  id: string;
  user_id: string;
  setups: string[];
  symbols: string[];
  timeframes: string[];
  sessions: string[];
  holidays: string[];
  theme: 'dark' | 'light';
  language: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Calculation Result Types
// ============================================================

/** Stats result from calcStats() */
export interface TradeStats {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number; // percentage 0-100
  grossWin: number;
  grossLoss: number; // positive number
  totalPnl: number;
  profitFactor: number; // grossWin / grossLoss, or 999 or 0
  avgWin: number;
  avgLoss: number; // positive number
  largestWin: number;
  largestLoss: number; // positive number
  maxWinStreak: number;
  maxLossStreak: number;
}

/** Max Drawdown result */
export interface DrawdownResult {
  maxDrawdownUsd: number;
  maxDrawdownPct: number; // percentage
  equityCurve: number[]; // cumulative P&L series
}

/** Expectancy result */
export interface ExpectancyResult {
  expectancyUsd: number;
  expectancyR: number | null; // null when no R data
}

/** Performance Score for radar chart (6-axis) */
export interface PerformanceScore {
  profitability: number; // 0-100
  riskManagement: number; // 0-100
  consistency: number; // 0-100
  discipline: number; // 0-100
  tradeQuality: number; // 0-100
  psychology: number; // 0-100
  overall: number; // average
}

/** Trade Quad Matrix categories */
export interface TradeQuadMatrix {
  correctWin: Trade[]; // Correct decision + Win (Đúng-Lãi)
  correctLoss: Trade[]; // Correct decision + Loss (Đúng-Lỗ)
  wrongWin: Trade[]; // Wrong decision + Win (Sai-Lãi)
  wrongLoss: Trade[]; // Wrong decision + Loss (Sai-Lỗ)
}

// ============================================================
// Insert / Update Types (for Supabase mutations)
// ============================================================

export type AccountInsert = Omit<Account, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type AccountUpdate = Partial<AccountInsert>;

type TradeCalculationFields =
  | 'profit_calc_mode' | 'contract_size' | 'tick_size' | 'tick_value' | 'conversion_rate'
  | 'fee_calc_mode' | 'commission_per_lot_round_turn' | 'swap_charge';
export type TradeInsert = Omit<Trade, 'id' | 'user_id' | 'created_at' | 'updated_at' | TradeCalculationFields>
  & Partial<Pick<Trade, TradeCalculationFields>>;
export type TradeUpdate = Partial<TradeInsert>;

export type AccountTransactionInsert = Omit<AccountTransaction, 'id' | 'user_id' | 'created_at'>;
export type AccountTransactionUpdate = Partial<AccountTransactionInsert>;

export type MarketAnalysisInsert = Omit<MarketAnalysis, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type MarketAnalysisUpdate = Partial<MarketAnalysisInsert>;

export type ReadinessCheckInsert = Omit<ReadinessCheck, 'id' | 'user_id' | 'total_score' | 'created_at'>;
export type ReadinessCheckUpdate = Partial<ReadinessCheckInsert>;

export type PlaybookEntryInsert = Omit<PlaybookEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type PlaybookEntryUpdate = Partial<PlaybookEntryInsert>;

export type SettingsInsert = Omit<Settings, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type SettingsUpdate = Partial<SettingsInsert>;
