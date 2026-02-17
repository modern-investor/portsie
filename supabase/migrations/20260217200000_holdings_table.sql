-- Holdings table: "What I own right now" — the source of truth for the dashboard.
-- One row per (account, asset). Updated on every data ingestion.
-- Supports tradeable assets (stocks, ETFs) and offline assets (real estate, metals, jewelry).

CREATE TABLE IF NOT EXISTS holdings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,

  -- Identification (tradeable assets use symbol; offline assets use name only)
  symbol TEXT,                   -- NULL for offline assets (real estate, jewelry, etc.)
  name TEXT NOT NULL,            -- Human-readable: "TSLA", "123 Main St", "Gold Bar 1oz"
  cusip TEXT,
  asset_type TEXT NOT NULL DEFAULT 'EQUITY',
    -- Tradeable: EQUITY, ETF, OPTION, MUTUAL_FUND, FIXED_INCOME, CASH_EQUIVALENT
    -- Offline:   REAL_ESTATE, PRECIOUS_METAL, VEHICLE, JEWELRY, COLLECTIBLE, OTHER_ASSET
  asset_category TEXT NOT NULL DEFAULT 'tradeable'
    CHECK (asset_category IN ('tradeable', 'offline')),
  description TEXT,

  -- Quantities (shares for tradeable; units/weight for offline; 1 for singular assets)
  quantity NUMERIC(18, 6) NOT NULL DEFAULT 1,
  quantity_unit TEXT NOT NULL DEFAULT 'shares',  -- 'shares', 'units', 'oz', 'sqft', etc.
  short_quantity NUMERIC(18, 6) NOT NULL DEFAULT 0,

  -- Cost basis
  purchase_date DATE,
  purchase_price NUMERIC(18, 6),     -- price per unit at purchase
  cost_basis_total NUMERIC(18, 2),   -- total cost basis

  -- Current valuation
  current_price NUMERIC(18, 6),      -- market price (tradeable) or appraised value per unit (offline)
  market_value NUMERIC(18, 2),       -- total current value
  valuation_date DATE,               -- when was this price/value last assessed
  valuation_source TEXT,             -- 'market', 'zillow', 'appraisal', 'manual', 'bank'

  -- P&L (computed or stored from data source)
  day_profit_loss NUMERIC(18, 2),
  day_profit_loss_pct NUMERIC(10, 4),
  unrealized_profit_loss NUMERIC(18, 2),
  unrealized_profit_loss_pct NUMERIC(10, 4),

  -- Offline asset metadata (flexible JSON — address, mortgage info, purity, VIN, etc.)
  metadata JSONB NOT NULL DEFAULT '{}',

  -- Data provenance
  data_source TEXT NOT NULL CHECK (data_source IN ('schwab_api', 'manual_upload', 'manual_entry', 'quiltt')),
  last_updated_from TEXT,   -- e.g. 'upload:{statement_id}', 'schwab_sync:2026-02-17', 'manual'

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- One holding per (account, identifier) — uses expression index for COALESCE
CREATE UNIQUE INDEX IF NOT EXISTS idx_holdings_account_asset
  ON holdings(account_id, COALESCE(symbol, ''), name);

-- Other indexes
CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_holdings_account ON holdings(account_id);
CREATE INDEX IF NOT EXISTS idx_holdings_user_symbol ON holdings(user_id, symbol) WHERE symbol IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_holdings_active ON holdings(account_id) WHERE quantity > 0;

-- RLS
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own holdings"
  ON holdings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own holdings"
  ON holdings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own holdings"
  ON holdings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own holdings"
  ON holdings FOR DELETE USING (auth.uid() = user_id);

-- Auto-update updated_at (reuses existing trigger function)
CREATE TRIGGER update_holdings_updated_at
  BEFORE UPDATE ON holdings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
