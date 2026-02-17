-- Extraction failures: logs repeated processing failures for diagnostic review
-- Auto-populated when a 2nd+ processing attempt fails on an uploaded statement

-- Add process_count to uploaded_statements to track attempt number
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS process_count INTEGER NOT NULL DEFAULT 0;

-- Extraction failures table
CREATE TABLE IF NOT EXISTS extraction_failures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  upload_id UUID NOT NULL REFERENCES uploaded_statements(id) ON DELETE CASCADE,

  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,              -- Supabase Storage path ({user_id}/{filename})

  attempt_number INTEGER NOT NULL,      -- Which attempt failed (2, 3, etc.)
  error_message TEXT NOT NULL,          -- The parse_error from the failed attempt
  raw_llm_response JSONB,              -- Raw LLM response for debugging (if available)

  -- Context for diagnosis
  llm_mode TEXT,                        -- 'cli' or 'api' at time of failure
  file_size_bytes BIGINT,

  resolved_at TIMESTAMPTZ,              -- When the bug was marked as fixed
  resolution_notes TEXT,                -- How it was fixed

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extraction_failures_user_id ON extraction_failures(user_id);
CREATE INDEX IF NOT EXISTS idx_extraction_failures_upload_id ON extraction_failures(upload_id);

ALTER TABLE extraction_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own extraction failures"
  ON extraction_failures FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own extraction failures"
  ON extraction_failures FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own extraction failures"
  ON extraction_failures FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own extraction failures"
  ON extraction_failures FOR DELETE
  USING (auth.uid() = user_id);

-- Reuse existing updated_at trigger function
CREATE TRIGGER update_extraction_failures_updated_at
  BEFORE UPDATE ON extraction_failures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
