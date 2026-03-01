-- Migration: Upload Searchable Metadata
-- Promotes frequently-queried fields from extracted_data JSONB and processing_log JSONB
-- into top-level indexed columns for efficient filtering and search.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Add new columns
-- ═══════════════════════════════════════════════════════════════════════════

-- Document-level metadata (from extracted_data.document)
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS document_institution TEXT,
  ADD COLUMN IF NOT EXISTS document_type TEXT,
  ADD COLUMN IF NOT EXISTS extraction_confidence TEXT;

-- Source detection (from source-detector.ts at upload time)
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS detected_source_kind TEXT;

-- Extraction counts
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS detected_account_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_positions_extracted INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_transactions_extracted INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_balances_extracted INTEGER DEFAULT 0;

-- Account grouping
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS primary_account_group TEXT;

-- Unallocated positions flag
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS has_unallocated_positions BOOLEAN DEFAULT false;

-- Processing diagnostics (from processing_settings / processing_log)
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS processing_backend TEXT,
  ADD COLUMN IF NOT EXISTS processing_model TEXT,
  ADD COLUMN IF NOT EXISTS processing_duration_ms INTEGER;

-- Error classification (from classifyError)
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS error_category TEXT;

-- Asset/account type arrays (unique values across all extracted accounts)
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS detected_asset_types TEXT[],
  ADD COLUMN IF NOT EXISTS account_types_detected TEXT[];


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Indexes for common query patterns
-- ═══════════════════════════════════════════════════════════════════════════

-- Filter by institution (admin dashboard, user search)
CREATE INDEX IF NOT EXISTS idx_us_document_institution
  ON uploaded_statements(user_id, document_institution)
  WHERE document_institution IS NOT NULL;

-- Filter by document type
CREATE INDEX IF NOT EXISTS idx_us_document_type
  ON uploaded_statements(user_id, document_type)
  WHERE document_type IS NOT NULL;

-- Filter by source kind (admin analytics)
CREATE INDEX IF NOT EXISTS idx_us_detected_source_kind
  ON uploaded_statements(detected_source_kind)
  WHERE detected_source_kind IS NOT NULL;

-- Filter by error category (failure analysis)
CREATE INDEX IF NOT EXISTS idx_us_error_category
  ON uploaded_statements(error_category)
  WHERE error_category IS NOT NULL;

-- Filter by processing backend (ops analytics)
CREATE INDEX IF NOT EXISTS idx_us_processing_backend
  ON uploaded_statements(processing_backend)
  WHERE processing_backend IS NOT NULL;

-- GIN index for array containment queries on asset types
CREATE INDEX IF NOT EXISTS idx_us_detected_asset_types
  ON uploaded_statements USING GIN (detected_asset_types)
  WHERE detected_asset_types IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Column comments
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN uploaded_statements.document_institution IS
  'Institution name from extracted_data.document.institution_name (e.g. "Charles Schwab")';
COMMENT ON COLUMN uploaded_statements.document_type IS
  'Document type from extracted_data.document.document_type (e.g. "portfolio_summary", "transaction_export")';
COMMENT ON COLUMN uploaded_statements.extraction_confidence IS
  'LLM confidence from extracted_data.confidence (high/medium/low)';
COMMENT ON COLUMN uploaded_statements.detected_source_kind IS
  'Source kind from source-detector.ts (e.g. "brokerage_statement_pdf", "transactions_csv")';
COMMENT ON COLUMN uploaded_statements.detected_account_count IS
  'Number of accounts detected in extracted_data.accounts[]';
COMMENT ON COLUMN uploaded_statements.total_positions_extracted IS
  'Sum of positions across all accounts + unallocated_positions';
COMMENT ON COLUMN uploaded_statements.total_transactions_extracted IS
  'Sum of transactions across all accounts';
COMMENT ON COLUMN uploaded_statements.total_balances_extracted IS
  'Sum of balances across all accounts';
COMMENT ON COLUMN uploaded_statements.primary_account_group IS
  'Account group from first account (e.g. "Non Retirement", "Retirement")';
COMMENT ON COLUMN uploaded_statements.has_unallocated_positions IS
  'True if extracted_data.unallocated_positions is non-empty';
COMMENT ON COLUMN uploaded_statements.processing_backend IS
  'LLM backend used: cli, gemini, or api';
COMMENT ON COLUMN uploaded_statements.processing_model IS
  'Specific model used (e.g. "claude-sonnet-4-6", "gemini-3-flash-preview")';
COMMENT ON COLUMN uploaded_statements.processing_duration_ms IS
  'Total extraction time in milliseconds from processing log';
COMMENT ON COLUMN uploaded_statements.error_category IS
  'Classified error type on failure: timeout, llm_error, validation_error, etc.';
COMMENT ON COLUMN uploaded_statements.detected_asset_types IS
  'Unique asset_type values from all positions (e.g. {"EQUITY","OPTION","ETF"})';
COMMENT ON COLUMN uploaded_statements.account_types_detected IS
  'Unique account_type values from all accounts (e.g. {"individual","roth_ira"})';


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Backfill existing rows from extracted_data JSONB
-- ═══════════════════════════════════════════════════════════════════════════

-- Backfill rows that have extracted_data (successful extractions)
UPDATE uploaded_statements
SET
  document_institution = extracted_data->'document'->>'institution_name',
  document_type = extracted_data->'document'->>'document_type',
  extraction_confidence = extracted_data->>'confidence',
  detected_account_count = COALESCE(jsonb_array_length(extracted_data->'accounts'), 0),
  primary_account_group = extracted_data->'accounts'->0->'account_info'->>'account_group',
  total_positions_extracted = (
    COALESCE((
      SELECT SUM(jsonb_array_length(acct->'positions'))
      FROM jsonb_array_elements(extracted_data->'accounts') AS acct
    ), 0) +
    COALESCE(jsonb_array_length(extracted_data->'unallocated_positions'), 0)
  )::integer,
  total_transactions_extracted = COALESCE((
    SELECT SUM(jsonb_array_length(acct->'transactions'))
    FROM jsonb_array_elements(extracted_data->'accounts') AS acct
  ), 0)::integer,
  total_balances_extracted = COALESCE((
    SELECT SUM(jsonb_array_length(acct->'balances'))
    FROM jsonb_array_elements(extracted_data->'accounts') AS acct
  ), 0)::integer,
  has_unallocated_positions = COALESCE(jsonb_array_length(extracted_data->'unallocated_positions'), 0) > 0,
  detected_asset_types = (
    SELECT ARRAY(SELECT DISTINCT val FROM (
      SELECT jsonb_array_elements(acct->'positions')->>'asset_type' AS val
      FROM jsonb_array_elements(extracted_data->'accounts') AS acct
      UNION ALL
      SELECT jsonb_array_elements(extracted_data->'unallocated_positions')->>'asset_type' AS val
    ) sub WHERE val IS NOT NULL ORDER BY val)
  ),
  account_types_detected = (
    SELECT ARRAY(SELECT DISTINCT acct->'account_info'->>'account_type'
      FROM jsonb_array_elements(extracted_data->'accounts') AS acct
      WHERE acct->'account_info'->>'account_type' IS NOT NULL
      ORDER BY 1)
  )
WHERE extracted_data IS NOT NULL
  AND document_institution IS NULL;  -- idempotent: skip already-backfilled rows

-- Backfill processing_backend and processing_model from processing_settings JSONB
UPDATE uploaded_statements
SET
  processing_backend = processing_settings->>'backend',
  processing_model = processing_settings->>'model'
WHERE processing_settings IS NOT NULL
  AND processing_backend IS NULL;

-- Backfill processing_duration_ms from processing_log JSONB
UPDATE uploaded_statements
SET
  processing_duration_ms = (processing_log->>'totalDurationMs')::integer
WHERE processing_log IS NOT NULL
  AND processing_duration_ms IS NULL
  AND processing_log->>'totalDurationMs' IS NOT NULL;

-- Backfill error_category from processing_log JSONB
UPDATE uploaded_statements
SET
  error_category = processing_log->>'errorCategory'
WHERE processing_log IS NOT NULL
  AND error_category IS NULL
  AND processing_log->>'errorCategory' IS NOT NULL;
