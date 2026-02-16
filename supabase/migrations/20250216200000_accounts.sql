-- Accounts table: user brokerage accounts
-- Supports both Schwab API-linked accounts and manual/upload-based accounts

CREATE TABLE accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data_source TEXT NOT NULL CHECK (data_source IN ('schwab_api', 'manual_upload', 'manual_entry')),

  -- Schwab API-specific fields (NULL for manual accounts)
  schwab_account_hash TEXT,
  schwab_account_number TEXT,

  -- Universal fields
  account_type TEXT,
  account_nickname TEXT,
  institution_name TEXT DEFAULT 'Charles Schwab',
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- A user can only link a given Schwab account once
  UNIQUE(user_id, schwab_account_hash)
);

CREATE INDEX idx_accounts_user_id ON accounts(user_id);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own accounts"
  ON accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts"
  ON accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts"
  ON accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts"
  ON accounts FOR DELETE
  USING (auth.uid() = user_id);
