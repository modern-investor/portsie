-- Position snapshots: point-in-time record of every holding in an account
-- Each row = one position at one moment in time
-- Enables "what did my portfolio look like on date X" reconstruction

CREATE TABLE position_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('daily_auto', 'manual', 'on_login', 'api_sync')),
  data_source TEXT NOT NULL CHECK (data_source IN ('schwab_api', 'manual_upload', 'manual_entry')),

  -- Position identification
  symbol TEXT NOT NULL,
  cusip TEXT,
  asset_type TEXT,
  description TEXT,

  -- Quantities
  quantity NUMERIC(18, 6) NOT NULL,
  short_quantity NUMERIC(18, 6) DEFAULT 0,

  -- Pricing / valuation at snapshot time
  average_cost_basis NUMERIC(18, 6),
  market_price_per_share NUMERIC(18, 6),
  market_value NUMERIC(18, 2),
  cost_basis_total NUMERIC(18, 2),

  -- P&L fields (captured from API, NULL for manual)
  day_profit_loss NUMERIC(18, 2),
  day_profit_loss_pct NUMERIC(10, 4),
  unrealized_profit_loss NUMERIC(18, 2),
  unrealized_profit_loss_pct NUMERIC(10, 4),

  created_at TIMESTAMPTZ DEFAULT now(),

  -- Prevent duplicate positions within the same snapshot
  UNIQUE(account_id, snapshot_date, symbol, snapshot_type)
);

-- "Show me all positions for account X on date Y"
CREATE INDEX idx_position_snapshots_account_date
  ON position_snapshots(account_id, snapshot_date DESC);

-- "Show me all my positions on date Y" (cross-account)
CREATE INDEX idx_position_snapshots_user_date
  ON position_snapshots(user_id, snapshot_date DESC);

-- "Show me historical data for AAPL across all snapshots"
CREATE INDEX idx_position_snapshots_symbol
  ON position_snapshots(user_id, symbol, snapshot_date DESC);

ALTER TABLE position_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own position snapshots"
  ON position_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own position snapshots"
  ON position_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own position snapshots"
  ON position_snapshots FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own position snapshots"
  ON position_snapshots FOR DELETE
  USING (auth.uid() = user_id);
