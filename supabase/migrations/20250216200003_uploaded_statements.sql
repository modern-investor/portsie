-- Uploaded statements: metadata for brokerage statement files (PDF/CSV)
-- Actual files stored in Supabase Storage 'statements' bucket

CREATE TABLE uploaded_statements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,

  -- File metadata
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'csv', 'ofx', 'qfx')),
  file_size_bytes BIGINT,
  file_hash TEXT,

  -- Parse lifecycle
  parse_status TEXT NOT NULL DEFAULT 'pending' CHECK (parse_status IN (
    'pending',
    'processing',
    'completed',
    'partial',
    'failed'
  )),
  parse_error TEXT,
  parsed_at TIMESTAMPTZ,
  transactions_created INTEGER DEFAULT 0,
  positions_created INTEGER DEFAULT 0,

  -- Statement metadata (extracted during parsing)
  statement_start_date DATE,
  statement_end_date DATE,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_uploaded_statements_user
  ON uploaded_statements(user_id, created_at DESC);

CREATE INDEX idx_uploaded_statements_status
  ON uploaded_statements(user_id, parse_status);

ALTER TABLE uploaded_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own uploaded statements"
  ON uploaded_statements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own uploaded statements"
  ON uploaded_statements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own uploaded statements"
  ON uploaded_statements FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own uploaded statements"
  ON uploaded_statements FOR DELETE
  USING (auth.uid() = user_id);
