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
