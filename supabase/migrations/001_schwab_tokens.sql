CREATE TABLE schwab_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE schwab_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own schwab tokens"
  ON schwab_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own schwab tokens"
  ON schwab_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own schwab tokens"
  ON schwab_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own schwab tokens"
  ON schwab_tokens FOR DELETE
  USING (auth.uid() = user_id);
