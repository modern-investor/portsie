-- Balance snapshots: account-level financial state at a point in time
-- Complements position_snapshots with cash, buying power, liquidation value
-- One row per account per snapshot event

CREATE TABLE balance_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('daily_auto', 'manual', 'on_login', 'api_sync')),
  data_source TEXT NOT NULL CHECK (data_source IN ('schwab_api', 'manual_upload', 'manual_entry')),

  -- Core balances
  liquidation_value NUMERIC(18, 2),
  cash_balance NUMERIC(18, 2),
  available_funds NUMERIC(18, 2),
  total_cash NUMERIC(18, 2),
  money_market_fund NUMERIC(18, 2),

  -- Equity values
  equity NUMERIC(18, 2),
  long_market_value NUMERIC(18, 2),
  short_market_value NUMERIC(18, 2),

  -- Options
  long_option_market_value NUMERIC(18, 2),
  short_option_market_value NUMERIC(18, 2),

  -- Margin
  maintenance_requirement NUMERIC(18, 2),
  buying_power NUMERIC(18, 2),
  day_trading_buying_power NUMERIC(18, 2),

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(account_id, snapshot_date, snapshot_type)
);

CREATE INDEX idx_balance_snapshots_account_date
  ON balance_snapshots(account_id, snapshot_date DESC);

CREATE INDEX idx_balance_snapshots_user_date
  ON balance_snapshots(user_id, snapshot_date DESC);

ALTER TABLE balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own balance snapshots"
  ON balance_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own balance snapshots"
  ON balance_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own balance snapshots"
  ON balance_snapshots FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own balance snapshots"
  ON balance_snapshots FOR DELETE
  USING (auth.uid() = user_id);
