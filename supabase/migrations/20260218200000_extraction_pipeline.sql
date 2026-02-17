-- Migration: Extraction Pipeline v1
-- Adds support for the 3-stage extraction pipeline:
--   Stage 1: LLM extraction → "extracted" status
--   Stage 2.5: Account matching → account_mappings
--   Stage 3: DB write → "completed" status

-- 1. Expand parse_status to include "extracted" (between processing and completed)
ALTER TABLE uploaded_statements
  DROP CONSTRAINT IF EXISTS uploaded_statements_parse_status_check;

ALTER TABLE uploaded_statements
  ADD CONSTRAINT uploaded_statements_parse_status_check
  CHECK (parse_status IN ('pending', 'processing', 'extracted', 'completed', 'partial', 'failed'));

-- 2. Store account mapping decisions for review/audit
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS account_mappings JSONB;

-- 3. Track which schema version was used for extraction
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS extraction_schema_version INTEGER;

-- 4. Add comment for documentation
COMMENT ON COLUMN uploaded_statements.account_mappings IS
  'AccountMapResult JSON — one mapping per extracted account, produced by Stage 2.5 deterministic matcher';

COMMENT ON COLUMN uploaded_statements.extraction_schema_version IS
  'PortsieExtraction schema version used (currently 1)';

COMMENT ON COLUMN uploaded_statements.parse_status IS
  'Pipeline status: pending → processing → extracted (Stage 1+2 done) → completed (Stage 3 done) | partial | failed';
