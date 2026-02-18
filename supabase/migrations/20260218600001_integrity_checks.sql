-- Add integrity report storage to uploaded_statements
-- and document-reported total to accounts for validation.

-- 1. Integrity report on uploaded_statements
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS integrity_report JSONB;

COMMENT ON COLUMN uploaded_statements.integrity_report IS
  'IntegrityReport JSON — post-extraction validation comparing extracted totals against document-reported totals';

-- 2. Document-reported total on accounts (what the statement said the account was worth)
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS document_reported_total NUMERIC(18, 2);

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS document_reported_date DATE;

COMMENT ON COLUMN accounts.document_reported_total IS
  'The total value reported by the source document for this account (for integrity validation)';

COMMENT ON COLUMN accounts.document_reported_date IS
  'The date of the document that reported document_reported_total';
