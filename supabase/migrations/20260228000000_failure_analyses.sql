-- failure_analyses: stores Claude Code analysis results for extraction failures
-- Populated by the CLI wrapper on the DO server after each failed extraction

CREATE TABLE IF NOT EXISTS failure_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  upload_id uuid REFERENCES uploaded_statements(id) ON DELETE SET NULL,
  extraction_failure_id uuid REFERENCES extraction_failures(id) ON DELETE SET NULL,

  -- Analysis content
  root_cause text NOT NULL,
  affected_step text,
  timing_breakdown jsonb,
  recommended_fix text,
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  analysis_model text,
  analysis_duration_ms integer,
  raw_analysis jsonb,

  -- Context snapshot (denormalized for historical reference)
  filename text,
  file_size_bytes integer,
  processing_settings jsonb,
  processing_log jsonb,

  created_at timestamptz DEFAULT now()
);

-- Fast lookups by user (Settings → Diagnostics tab)
CREATE INDEX IF NOT EXISTS idx_failure_analyses_user
  ON failure_analyses(user_id, created_at DESC);

-- Link back to specific upload
CREATE INDEX IF NOT EXISTS idx_failure_analyses_upload
  ON failure_analyses(upload_id);

-- Link back to extraction failure record
CREATE INDEX IF NOT EXISTS idx_failure_analyses_failure
  ON failure_analyses(extraction_failure_id);

-- RLS: users can only read their own analyses
ALTER TABLE failure_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own failure analyses"
  ON failure_analyses FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert (CLI wrapper uses service role key)
CREATE POLICY "Service role can insert failure analyses"
  ON failure_analyses FOR INSERT
  WITH CHECK (true);
