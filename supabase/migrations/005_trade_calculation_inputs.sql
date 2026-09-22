-- Preserve the explicit broker assumptions behind optional automatic P&L estimates.
-- Positive fee means a net cost; negative fee means a net credit.
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
