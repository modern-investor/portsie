CREATE TABLE schwab_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_key_encrypted TEXT NOT NULL,
  app_secret_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE schwab_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own schwab credentials"
  ON schwab_credentials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own schwab credentials"
  ON schwab_credentials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own schwab credentials"
  ON schwab_credentials FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own schwab credentials"
  ON schwab_credentials FOR DELETE
  USING (auth.uid() = user_id);
