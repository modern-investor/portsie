-- Migration: Upload Pipeline Reliability
-- Adds columns for atomic extraction lock, write warnings tracking,
-- and expands parse_status to include completed_with_warnings.

-- 1. Atomic extraction lock columns
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS processing_lock_id TEXT;

ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;

-- 2. Write warnings tracking (JSONB array of warning strings)
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS write_warnings JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 3. Comments
COMMENT ON COLUMN uploaded_statements.processing_lock_id IS
  'Random UUID set atomically when transitioning to processing status — used for CAS lock';

COMMENT ON COLUMN uploaded_statements.processing_started_at IS
  'Timestamp when processing started — used for stale detection';

COMMENT ON COLUMN uploaded_statements.write_warnings IS
  'Array of warning strings from partial write failures during Stage 3 (e.g. summary update failed)';
