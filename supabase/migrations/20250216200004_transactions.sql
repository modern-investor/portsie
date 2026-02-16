-- Transactions: buy/sell/dividend/transfer history
-- Supports both Schwab API-sourced and parsed statement data

CREATE TABLE transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  data_source TEXT NOT NULL CHECK (data_source IN ('schwab_api', 'manual_upload', 'manual_entry')),

  -- Transaction identification
  external_transaction_id TEXT,
  transaction_date DATE NOT NULL,
  settlement_date DATE,

  -- Instrument
  symbol TEXT,
  cusip TEXT,
  asset_type TEXT,
  description TEXT,

  -- Action
  action TEXT NOT NULL CHECK (action IN (
    'buy', 'sell',
    'buy_to_cover', 'sell_short',
    'dividend', 'capital_gain_long', 'capital_gain_short',
    'interest',
    'transfer_in', 'transfer_out',
    'fee', 'commission',
    'stock_split', 'merger', 'spinoff',
    'reinvestment',
    'journal',
    'other'
  )),

  -- Financial details
  quantity NUMERIC(18, 6),
  price_per_share NUMERIC(18, 6),
  total_amount NUMERIC(18, 2) NOT NULL,
  fees NUMERIC(18, 2) DEFAULT 0,
  commission NUMERIC(18, 2) DEFAULT 0,

  -- Source tracking
  uploaded_statement_id UUID REFERENCES uploaded_statements(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Prevent duplicate imports from the same source
  UNIQUE(account_id, external_transaction_id)
);

-- All transactions for an account, most recent first
CREATE INDEX idx_transactions_account_date
  ON transactions(account_id, transaction_date DESC);

-- User's full transaction history
CREATE INDEX idx_transactions_user_date
  ON transactions(user_id, transaction_date DESC);

-- "Show me all AAPL trades"
CREATE INDEX idx_transactions_symbol
  ON transactions(user_id, symbol, transaction_date DESC);

-- "Show me all dividends"
CREATE INDEX idx_transactions_action
  ON transactions(user_id, action, transaction_date DESC);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON transactions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON transactions FOR DELETE
  USING (auth.uid() = user_id);
