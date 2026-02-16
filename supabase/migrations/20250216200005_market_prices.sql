-- Market prices: historical price data for securities
-- PUBLIC data, not user-specific

CREATE TABLE market_prices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  price_date DATE NOT NULL,

  -- OHLCV data
  open_price NUMERIC(18, 6),
  high_price NUMERIC(18, 6),
  low_price NUMERIC(18, 6),
  close_price NUMERIC(18, 6) NOT NULL,
  adjusted_close NUMERIC(18, 6),
  volume BIGINT,

  -- Metadata
  source TEXT DEFAULT 'schwab_api',
  created_at TIMESTAMPTZ DEFAULT now(),

  -- One price per symbol per day
  UNIQUE(symbol, price_date)
);

-- Price history for a symbol over a date range
CREATE INDEX idx_market_prices_symbol_date
  ON market_prices(symbol, price_date DESC);

-- All prices on a given date (for portfolio valuation)
CREATE INDEX idx_market_prices_date
  ON market_prices(price_date DESC, symbol);

-- RLS: any authenticated user can read, only service_role can write
ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view market prices"
  ON market_prices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert market prices"
  ON market_prices FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update market prices"
  ON market_prices FOR UPDATE
  TO service_role
  USING (true);
