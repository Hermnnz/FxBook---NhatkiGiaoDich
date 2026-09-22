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
  CONSTRAINT trades_fee_nonnegative CHECK (fee >= 0),
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
-- Phase 5: private chart images, analysis bias, and server-owned trial records.

ALTER TABLE public.market_analyses
  ADD COLUMN IF NOT EXISTS bias TEXT NOT NULL DEFAULT 'waiting'
  CHECK (bias IN ('bullish', 'bearish', 'neutral', 'waiting'));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('charts', 'charts', false, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "charts_select_own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "charts_insert_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "charts_update_own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
WITH CHECK (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
CREATE POLICY "charts_delete_own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  trial_started_at TIMESTAMPTZ NOT NULL,
  trial_ends_at TIMESTAMPTZ NOT NULL,
  paid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trial_dates_valid CHECK (trial_ends_at > trial_started_at)
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscriptions FROM anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
CREATE POLICY "subscriptions_select_own" ON public.subscriptions FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.create_trial_for_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, trial_started_at, trial_ends_at)
  VALUES (NEW.id, NEW.created_at, NEW.created_at + INTERVAL '30 days')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_trial ON auth.users;
CREATE TRIGGER on_auth_user_created_trial AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_trial_for_new_user();

INSERT INTO public.subscriptions (user_id, trial_started_at, trial_ends_at)
SELECT id, created_at, created_at + INTERVAL '30 days' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
-- An expired trial is read-only. Users retain SELECT/export access to their own data.
-- The trusted database administrator can extend paid_until; clients cannot edit subscriptions.

CREATE OR REPLACE FUNCTION public.can_write_journal()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = (SELECT auth.uid())
      AND (s.trial_ends_at > now() OR s.paid_until > now())
  );
$$;
REVOKE ALL ON FUNCTION public.can_write_journal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_journal() TO authenticated;

DO $$
DECLARE
  table_name text;
  old_policy text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['accounts', 'account_transactions', 'trades', 'market_analyses', 'readiness_checks', 'playbook', 'settings'] LOOP
    old_policy := 'Users can manage own ' || table_name;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', old_policy, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id)', table_name || '_read_own', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id AND (SELECT public.can_write_journal()))', table_name || '_insert_active', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id AND (SELECT public.can_write_journal())) WITH CHECK ((SELECT auth.uid()) = user_id AND (SELECT public.can_write_journal()))', table_name || '_update_active', table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id AND (SELECT public.can_write_journal()))', table_name || '_delete_active', table_name);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "charts_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "charts_update_own" ON storage.objects;
DROP POLICY IF EXISTS "charts_delete_own" ON storage.objects;
CREATE POLICY "charts_insert_active" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT public.can_write_journal()));
CREATE POLICY "charts_update_active" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT public.can_write_journal()))
WITH CHECK (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT public.can_write_journal()));
CREATE POLICY "charts_delete_active" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'charts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT public.can_write_journal()));
-- Enforce that account-linked rows belong to the same user as their account.
-- This migration also upgrades projects that ran 001 before the constraints were added.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.account_transactions t
    LEFT JOIN public.accounts a ON a.id = t.account_id
    WHERE a.id IS NULL OR a.user_id <> t.user_id
  ) OR EXISTS (
    SELECT 1 FROM public.trades t
    LEFT JOIN public.accounts a ON a.id = t.account_id
    WHERE a.id IS NULL OR a.user_id <> t.user_id
  ) OR EXISTS (
    SELECT 1 FROM public.market_analyses m
    JOIN public.accounts a ON a.id = m.account_id
    WHERE a.user_id <> m.user_id
  ) THEN
    RAISE EXCEPTION 'Account ownership mismatch exists. Inspect account_transactions, trades and market_analyses before applying 004.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_accounts_user_id_id') THEN
    ALTER TABLE public.accounts ADD CONSTRAINT uq_accounts_user_id_id UNIQUE (user_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_transactions_owner_fk') THEN
    ALTER TABLE public.account_transactions ADD CONSTRAINT account_transactions_owner_fk
      FOREIGN KEY (user_id, account_id) REFERENCES public.accounts (user_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trades_owner_fk') THEN
    ALTER TABLE public.trades ADD CONSTRAINT trades_owner_fk
      FOREIGN KEY (user_id, account_id) REFERENCES public.accounts (user_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'market_analyses_owner_fk') THEN
    ALTER TABLE public.market_analyses ADD CONSTRAINT market_analyses_owner_fk
      FOREIGN KEY (user_id, account_id) REFERENCES public.accounts (user_id, id) ON DELETE SET NULL (account_id);
  END IF;
END $$;

-- Migration 005: explicit broker assumptions for P&L and signed net fees.
ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_fee_nonnegative;

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS profit_calc_mode TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS contract_size NUMERIC(20,8),
  ADD COLUMN IF NOT EXISTS tick_size NUMERIC(20,8),
  ADD COLUMN IF NOT EXISTS tick_value NUMERIC(20,8),
  ADD COLUMN IF NOT EXISTS conversion_rate NUMERIC(20,10),
  ADD COLUMN IF NOT EXISTS fee_calc_mode TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS commission_per_lot_round_turn NUMERIC(15,4),
  ADD COLUMN IF NOT EXISTS swap_charge NUMERIC(15,2);

ALTER TABLE public.trades
  ADD CONSTRAINT trades_profit_calc_mode_valid CHECK (profit_calc_mode IN ('manual', 'contract', 'tick')),
  ADD CONSTRAINT trades_fee_calc_mode_valid CHECK (fee_calc_mode IN ('manual', 'per_lot')),
  ADD CONSTRAINT trades_contract_size_positive CHECK (contract_size IS NULL OR contract_size > 0),
  ADD CONSTRAINT trades_tick_size_positive CHECK (tick_size IS NULL OR tick_size > 0),
  ADD CONSTRAINT trades_tick_value_positive CHECK (tick_value IS NULL OR tick_value > 0),
  ADD CONSTRAINT trades_conversion_rate_positive CHECK (conversion_rate IS NULL OR conversion_rate > 0),
  ADD CONSTRAINT trades_commission_per_lot_nonnegative CHECK (commission_per_lot_round_turn IS NULL OR commission_per_lot_round_turn >= 0),
  ADD CONSTRAINT trades_auto_profit_inputs CHECK (
    profit_calc_mode = 'manual'
    OR (entry_price IS NOT NULL AND exit_price IS NOT NULL AND conversion_rate IS NOT NULL
      AND (profit_calc_mode = 'contract' AND contract_size IS NOT NULL
        OR profit_calc_mode = 'tick' AND tick_size IS NOT NULL AND tick_value IS NOT NULL))
  ),
  ADD CONSTRAINT trades_auto_fee_inputs CHECK (
    fee_calc_mode = 'manual'
    OR (commission_per_lot_round_turn IS NOT NULL AND swap_charge IS NOT NULL)
  );

-- Migration 006: one written reflection per user/account/period/section.
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS eval_errors_reviewed boolean NOT NULL DEFAULT false;
UPDATE public.trades SET eval_errors_reviewed = true
  WHERE jsonb_typeof(eval_errors) = 'array' AND jsonb_array_length(eval_errors) > 0;

CREATE TABLE public.report_review_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  cycle_type text NOT NULL CHECK (cycle_type IN ('week', 'month')),
  period_start date NOT NULL,
  section text NOT NULL CHECK (section IN ('edge', 'execution')),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_review_sections_account_fk FOREIGN KEY (user_id, account_id)
    REFERENCES public.accounts(user_id, id) ON DELETE CASCADE,
  CONSTRAINT report_review_sections_unique UNIQUE (user_id, account_id, cycle_type, period_start, section)
);

CREATE TRIGGER trg_report_review_sections_updated_at
  BEFORE UPDATE ON public.report_review_sections FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.report_review_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY report_reviews_read_own ON public.report_review_sections FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY report_reviews_insert_active ON public.report_review_sections FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND (SELECT public.can_write_journal()));
CREATE POLICY report_reviews_update_active ON public.report_review_sections FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND (SELECT public.can_write_journal()))
  WITH CHECK ((SELECT auth.uid()) = user_id AND (SELECT public.can_write_journal()));
CREATE POLICY report_reviews_delete_active ON public.report_review_sections FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND (SELECT public.can_write_journal()));
