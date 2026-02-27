-- Migration: Adaptive Ingestion Foundation
-- Adds governance and observability tables for source onboarding,
-- ingestion run diagnostics, and controlled schema evolution.

-- 1) Source registry
CREATE TABLE IF NOT EXISTS ingestion_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('api', 'file', 'hybrid')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ingestion_sources IS
  'Registry of logical ingestion sources used by runs and schema observations.';
COMMENT ON COLUMN ingestion_sources.key IS
  'Stable source key (e.g. upload_document, quiltt_sync).';

-- Seed initial sources (idempotent)
INSERT INTO ingestion_sources (key, source_type, description)
VALUES
  ('upload_document', 'file', 'Document extraction from uploaded file'),
  ('quiltt_sync', 'api', 'Quiltt API sync'),
  ('schwab_api_sync', 'api', 'Schwab API sync')
ON CONFLICT (key) DO NOTHING;

-- 2) Per-run execution records
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES ingestion_sources(id),
  uploaded_statement_id UUID REFERENCES uploaded_statements(id) ON DELETE SET NULL,
  run_kind TEXT NOT NULL CHECK (run_kind IN ('upload', 'extract', 'confirm', 'verify', 'api_sync', 'webhook')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'partial', 'failed')),
  backend TEXT,
  model TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_category TEXT,
  error_message TEXT,
  diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_user_started
  ON ingestion_runs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source_status
  ON ingestion_runs(source_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_statement
  ON ingestion_runs(uploaded_statement_id)
  WHERE uploaded_statement_id IS NOT NULL;

COMMENT ON TABLE ingestion_runs IS
  'One row per ingestion attempt across upload and API pipelines.';
COMMENT ON COLUMN ingestion_runs.diagnostics IS
  'Redacted diagnostic metadata including detector output and counters.';

-- 3) Observed source structures (signatures)
CREATE TABLE IF NOT EXISTS source_schema_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES ingestion_sources(id) ON DELETE CASCADE,
  structure_signature TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_count INTEGER NOT NULL DEFAULT 1,
  sample_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, structure_signature, schema_version)
);

CREATE INDEX IF NOT EXISTS idx_source_schema_registry_source
  ON source_schema_registry(source_id, last_seen_at DESC);

COMMENT ON TABLE source_schema_registry IS
  'Known structure signatures seen per source to accelerate onboarding.';

-- 4) Unknown/unmapped observations
CREATE TABLE IF NOT EXISTS ingestion_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id UUID NOT NULL REFERENCES ingestion_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES ingestion_sources(id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,
  observed_type TEXT,
  observed_value JSONB,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_observations_source_path
  ON ingestion_observations(source_id, field_path);
CREATE INDEX IF NOT EXISTS idx_ingestion_observations_run
  ON ingestion_observations(ingestion_run_id);

COMMENT ON TABLE ingestion_observations IS
  'Observed unknown/unmapped fields from normalization and validation.';

-- 5) Controlled schema proposals
CREATE TABLE IF NOT EXISTS schema_change_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('open', 'approved', 'rejected', 'implemented')),
  proposal_type TEXT NOT NULL CHECK (proposal_type IN ('enum_extension', 'new_field', 'new_table', 'constraint_change')),
  rationale TEXT NOT NULL,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  risk_score INTEGER NOT NULL DEFAULT 0,
  proposal_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schema_change_proposals_status
  ON schema_change_proposals(status, created_at DESC);

COMMENT ON TABLE schema_change_proposals IS
  'Human-reviewed schema evolution proposals generated from observations.';

-- RLS policies
ALTER TABLE ingestion_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_schema_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_change_proposals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ingestion_sources' AND policyname = 'Authenticated users can read ingestion_sources') THEN
    CREATE POLICY "Authenticated users can read ingestion_sources"
      ON ingestion_sources FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ingestion_sources' AND policyname = 'Service role full access on ingestion_sources') THEN
    CREATE POLICY "Service role full access on ingestion_sources"
      ON ingestion_sources FOR ALL
      USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ingestion_runs' AND policyname = 'Users can view own ingestion_runs') THEN
    CREATE POLICY "Users can view own ingestion_runs"
      ON ingestion_runs FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ingestion_runs' AND policyname = 'Users can insert own ingestion_runs') THEN
    CREATE POLICY "Users can insert own ingestion_runs"
      ON ingestion_runs FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ingestion_runs' AND policyname = 'Users can update own ingestion_runs') THEN
    CREATE POLICY "Users can update own ingestion_runs"
      ON ingestion_runs FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ingestion_runs' AND policyname = 'Service role full access on ingestion_runs') THEN
    CREATE POLICY "Service role full access on ingestion_runs"
      ON ingestion_runs FOR ALL
      USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'source_schema_registry' AND policyname = 'Authenticated users can read source_schema_registry') THEN
    CREATE POLICY "Authenticated users can read source_schema_registry"
      ON source_schema_registry FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'source_schema_registry' AND policyname = 'Service role full access on source_schema_registry') THEN
    CREATE POLICY "Service role full access on source_schema_registry"
      ON source_schema_registry FOR ALL
      USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ingestion_observations' AND policyname = 'Users can view own ingestion_observations') THEN
    CREATE POLICY "Users can view own ingestion_observations"
      ON ingestion_observations FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ingestion_observations' AND policyname = 'Users can insert own ingestion_observations') THEN
    CREATE POLICY "Users can insert own ingestion_observations"
      ON ingestion_observations FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ingestion_observations' AND policyname = 'Service role full access on ingestion_observations') THEN
    CREATE POLICY "Service role full access on ingestion_observations"
      ON ingestion_observations FOR ALL
      USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'schema_change_proposals' AND policyname = 'Authenticated users can read schema_change_proposals') THEN
    CREATE POLICY "Authenticated users can read schema_change_proposals"
      ON schema_change_proposals FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'schema_change_proposals' AND policyname = 'Service role full access on schema_change_proposals') THEN
    CREATE POLICY "Service role full access on schema_change_proposals"
      ON schema_change_proposals FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;
