-- ==============================================================================
-- FxBook Initial Database Schema Migration
-- Migration: 001_initial_schema.sql
-- Description: Sets up core trading journal tables with Row Level Security (RLS)
-- ==============================================================================

-- Enable pgcrypto extension for UUID generation (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- HELPER FUNCTIONS & TRIGGERS
-- ==============================================================================

-- Trigger function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 1. ACCOUNTS TABLE
-- ==============================================================================
-- Stores user trading accounts (e.g., MT5 Real, MT5 Demo, Prop Firm accounts)
CREATE TABLE IF NOT EXISTS accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  initial_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  risk_pct NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_accounts_user_id_name UNIQUE (user_id, name),
  CONSTRAINT uq_accounts_user_id_id UNIQUE (user_id, id),
  CONSTRAINT accounts_initial_balance_finite CHECK (initial_balance >= 0),
  CONSTRAINT accounts_risk_pct_range CHECK (risk_pct > 0 AND risk_pct <= 100)
);

-- RLS: accounts
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own accounts" ON accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger: accounts.updated_at
CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 2. ACCOUNT TRANSACTIONS TABLE
-- ==============================================================================
-- Tracks deposits and withdrawals for balance reconciliation
CREATE TABLE IF NOT EXISTS account_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal')),
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  note TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT account_transactions_owner_fk FOREIGN KEY (user_id, account_id)
    REFERENCES accounts (user_id, id) ON DELETE CASCADE
);

-- RLS: account_transactions
ALTER TABLE account_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own account_transactions" ON account_transactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- 3. TRADES TABLE
-- ==============================================================================
-- Core trading journal entries (manual or imported via MT5 sync)
CREATE TABLE IF NOT EXISTS trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  close_time TIMESTAMPTZ,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('buy', 'sell')),
  entry_price NUMERIC(20,8),
  exit_price NUMERIC(20,8),
  volume NUMERIC(15,8) NOT NULL,
  profit NUMERIC(15,2) NOT NULL DEFAULT 0,
  fee NUMERIC(15,2) NOT NULL DEFAULT 0,
  theoretical_profit NUMERIC(15,2),
  risk_amount NUMERIC(15,2),
  sl_price NUMERIC(20,8),
  tp_price NUMERIC(20,8),
  setup TEXT,
  timeframe TEXT,
  session TEXT,
  tradingview_url TEXT,
  note TEXT,
  mt5_key TEXT,
  incomplete BOOLEAN NOT NULL DEFAULT false,
  eval_before JSONB DEFAULT '[]'::jsonb,
  eval_during JSONB DEFAULT '[]'::jsonb,
  eval_after JSONB DEFAULT '[]'::jsonb,
  eval_errors JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trades_owner_fk FOREIGN KEY (user_id, account_id)
    REFERENCES accounts (user_id, id) ON DELETE CASCADE,
  CONSTRAINT trades_volume_positive CHECK (volume > 0),
  CONSTRAINT trades_risk_positive CHECK (risk_amount IS NULL OR risk_amount > 0),
  CONSTRAINT trades_close_after_open CHECK (close_time IS NULL OR close_time >= date)
);

-- RLS: trades
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own trades" ON trades
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger: trades.updated_at
CREATE TRIGGER trg_trades_updated_at
  BEFORE UPDATE ON trades
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Deduplication index for MT5 imports
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_user_mt5_key
  ON trades (user_id, mt5_key)
  WHERE mt5_key IS NOT NULL;

-- ==============================================================================
-- 4. MARKET ANALYSES TABLE
-- ==============================================================================
-- Pre-market analysis, trade setup planning, and outcome monitoring
CREATE TABLE IF NOT EXISTS market_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  symbol TEXT NOT NULL,
  direction TEXT CHECK (direction IN ('buy', 'sell')),
  timeframe TEXT,
  setup TEXT,
  entry_zone TEXT,
  sl_zone TEXT,
  tp_zones TEXT,
  lot_size NUMERIC(15,8),
  risk_usd NUMERIC(15,2),
  risk_reward NUMERIC(5,2),
  tradingview_url TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled', 'missed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT market_analyses_owner_fk FOREIGN KEY (user_id, account_id)
    REFERENCES accounts (user_id, id) ON DELETE SET NULL (account_id)
);

-- RLS: market_analyses
ALTER TABLE market_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own market_analyses" ON market_analyses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger: market_analyses.updated_at
CREATE TRIGGER trg_market_analyses_updated_at
  BEFORE UPDATE ON market_analyses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 5. READINESS CHECKS TABLE
-- ==============================================================================
-- Daily psychological and emotional state evaluations (0-2 scores per domain)
CREATE TABLE IF NOT EXISTS readiness_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  physical_score SMALLINT NOT NULL DEFAULT 0 CHECK (physical_score BETWEEN 0 AND 2),
  mental_score SMALLINT NOT NULL DEFAULT 0 CHECK (mental_score BETWEEN 0 AND 2),
  market_score SMALLINT NOT NULL DEFAULT 0 CHECK (market_score BETWEEN 0 AND 2),
  plan_score SMALLINT NOT NULL DEFAULT 0 CHECK (plan_score BETWEEN 0 AND 2),
  discipline_score SMALLINT NOT NULL DEFAULT 0 CHECK (discipline_score BETWEEN 0 AND 2),
  total_score SMALLINT GENERATED ALWAYS AS (physical_score + mental_score + plan_score + discipline_score + market_score) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_readiness_checks_user_date UNIQUE (user_id, date)
);

-- RLS: readiness_checks
ALTER TABLE readiness_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own readiness_checks" ON readiness_checks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- 6. PLAYBOOK TABLE
-- ==============================================================================
-- Rules, philosophies, and trade setups playbook
CREATE TABLE IF NOT EXISTS playbook (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('philosophy', 'rule', 'setup')),
  title TEXT NOT NULL,
  content TEXT,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: playbook
ALTER TABLE playbook ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own playbook" ON playbook
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger: playbook.updated_at
CREATE TRIGGER trg_playbook_updated_at
  BEFORE UPDATE ON playbook
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 7. SETTINGS TABLE
-- ==============================================================================
-- User configuration, tags, sessions, timeframes, and preferences
CREATE TABLE IF NOT EXISTS settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  setups JSONB DEFAULT '[]'::jsonb,
  symbols JSONB DEFAULT '[]'::jsonb,
  timeframes JSONB DEFAULT '[]'::jsonb,
  sessions JSONB DEFAULT '[]'::jsonb,
  holidays JSONB DEFAULT '[]'::jsonb,
  theme TEXT NOT NULL DEFAULT 'dark',
  language TEXT NOT NULL DEFAULT 'vi',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: settings
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own settings" ON settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger: settings.updated_at
CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- PERFORMANCE INDEXES
-- ==============================================================================

-- Index accounts by user
CREATE INDEX IF NOT EXISTS idx_accounts_user_id
  ON accounts (user_id);

-- Index transactions by account and date, plus user
CREATE INDEX IF NOT EXISTS idx_account_transactions_account_date
  ON account_transactions (account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_account_transactions_user_id
  ON account_transactions (user_id);

-- Index trades by account/date, user/symbol, and user/date
CREATE INDEX IF NOT EXISTS idx_trades_account_date
  ON trades (account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_trades_user_symbol
  ON trades (user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_trades_user_date
  ON trades (user_id, date DESC);

-- Index market analyses by user/date and account
CREATE INDEX IF NOT EXISTS idx_market_analyses_user_date
  ON market_analyses (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_market_analyses_account_id
  ON market_analyses (account_id);

-- Index readiness checks by user and date
CREATE INDEX IF NOT EXISTS idx_readiness_checks_user_date
  ON readiness_checks (user_id, date DESC);

-- Index playbook by user and sort order
CREATE INDEX IF NOT EXISTS idx_playbook_user_order
  ON playbook (user_id, sort_order ASC);
