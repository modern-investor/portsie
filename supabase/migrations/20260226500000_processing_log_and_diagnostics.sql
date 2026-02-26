-- Migration: Processing Log & Diagnostics
-- Adds processing waypoint log and step tracking for upload processing.
-- Also extends extraction_failures with richer diagnostic columns.

-- 1. Processing waypoint log on uploaded_statements
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS processing_log JSONB,
  ADD COLUMN IF NOT EXISTS processing_step TEXT;

COMMENT ON COLUMN uploaded_statements.processing_log IS
  'Structured ProcessingLog JSON — waypoints, timing, backend info, errors';

COMMENT ON COLUMN uploaded_statements.processing_step IS
  'Current processing step string for fast polling (e.g. extracting, validating)';

-- 2. Extend extraction_failures with richer diagnostic columns
ALTER TABLE extraction_failures
  ADD COLUMN IF NOT EXISTS error_category TEXT,
  ADD COLUMN IF NOT EXISTS processing_step TEXT,
  ADD COLUMN IF NOT EXISTS backend_used TEXT,
  ADD COLUMN IF NOT EXISTS model_used TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS processing_log JSONB,
  ADD COLUMN IF NOT EXISTS processing_settings JSONB;

COMMENT ON COLUMN extraction_failures.error_category IS
  'Classified error type: timeout, llm_error, validation_error, download_error, db_error, network_error, unknown';

COMMENT ON COLUMN extraction_failures.processing_step IS
  'Which processing step was active when the failure occurred';

COMMENT ON COLUMN extraction_failures.backend_used IS
  'LLM backend that was in use (gemini, cli, api)';

COMMENT ON COLUMN extraction_failures.model_used IS
  'Specific model that was in use (e.g. gemini-3-flash-preview)';

COMMENT ON COLUMN extraction_failures.duration_ms IS
  'How long the attempt ran before failing';

COMMENT ON COLUMN extraction_failures.processing_log IS
  'Full ProcessingLog JSON from the failed attempt';

COMMENT ON COLUMN extraction_failures.processing_settings IS
  'Processing preset/settings used for the attempt';
