-- Migration: Add quality check columns to uploaded_statements
-- Extends parse_status with QC lifecycle states and adds QC reference columns.

-- Widen parse_status constraint to include QC states
ALTER TABLE uploaded_statements
  DROP CONSTRAINT IF EXISTS uploaded_statements_parse_status_check;

ALTER TABLE uploaded_statements
  ADD CONSTRAINT uploaded_statements_parse_status_check
  CHECK (parse_status IN (
    'pending', 'processing', 'extracted', 'completed', 'partial', 'failed',
    'qc_running', 'qc_failed', 'qc_fixing'
  ));

-- Reference to the active/latest quality check
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS quality_check_id UUID REFERENCES quality_checks(id);

-- Human-readable QC status message for the UI
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS qc_status_message TEXT;

COMMENT ON COLUMN uploaded_statements.parse_status IS
  'Pipeline status: pending → processing → extracted → completed | partial | failed | qc_running → qc_failed → qc_fixing → completed';

COMMENT ON COLUMN uploaded_statements.quality_check_id IS
  'FK to the latest quality_checks row for this upload';

COMMENT ON COLUMN uploaded_statements.qc_status_message IS
  'Human-readable QC status message shown in the upload list UI';
