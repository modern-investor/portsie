-- Migration: Quality Checks table
-- Tracks automatic quality verification of uploaded document extractions.
-- After auto-confirm writes data to canonical tables, a quality check compares
-- the extraction's claimed values against what actually landed in the DB.
-- When discrepancies are found, fix attempts are tracked here.

CREATE TABLE IF NOT EXISTS quality_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  upload_id UUID NOT NULL REFERENCES uploaded_statements(id) ON DELETE CASCADE,

  -- Check inputs (snapshot at check time)
  extraction_data JSONB NOT NULL,
  linked_account_ids UUID[] NOT NULL DEFAULT '{}',

  -- Check status lifecycle
  check_status TEXT NOT NULL DEFAULT 'running'
    CHECK (check_status IN (
      'running',         -- check in progress
      'passed',          -- all checks passed
      'failed',          -- discrepancies found, no fix attempted yet
      'fixing_prompt',   -- Phase 1: prompt-based re-extraction in progress
      'fixing_code',     -- Phase 2: code fix in progress
      'fixed',           -- fix succeeded, data rewritten
      'unresolved'       -- all fix attempts exhausted
    )),

  -- Structured check results
  checks JSONB NOT NULL DEFAULT '{}',

  -- Fix attempts (append-only JSONB array)
  fix_attempts JSONB NOT NULL DEFAULT '[]',

  -- Metadata
  fix_count INTEGER NOT NULL DEFAULT 0,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_checks_upload ON quality_checks(upload_id);
CREATE INDEX IF NOT EXISTS idx_quality_checks_user ON quality_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_quality_checks_status ON quality_checks(check_status)
  WHERE check_status NOT IN ('passed', 'fixed');

ALTER TABLE quality_checks ENABLE ROW LEVEL SECURITY;

-- Users can view/insert/update own quality checks
CREATE POLICY "Users can view own quality checks"
  ON quality_checks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own quality checks"
  ON quality_checks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own quality checks"
  ON quality_checks FOR UPDATE USING (auth.uid() = user_id);

-- Admins can view all quality checks (for admin dashboard)
CREATE POLICY "Admins can view all quality checks"
  ON quality_checks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Auto-update updated_at trigger (reuses existing function from updated_at_triggers migration)
CREATE TRIGGER update_quality_checks_updated_at
  BEFORE UPDATE ON quality_checks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
