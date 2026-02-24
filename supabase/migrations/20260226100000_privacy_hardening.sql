-- Migration: Privacy Hardening
-- Clean-slate privacy overhaul: encrypt direct identifiers, drop plaintext
-- sensitive columns, add retention tracking.
--
-- Context: No irreplaceable production data exists yet. Breaking schema
-- changes are acceptable to achieve a clean privacy-first target schema.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. accounts: encrypt account numbers, add token-based lookup
-- ═══════════════════════════════════════════════════════════════════════════

-- Add encrypted + tokenized columns
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_number_encrypted TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_number_token TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_number_hint TEXT;

-- Index for token-based exact-match lookups (replaces plaintext searches)
CREATE INDEX IF NOT EXISTS idx_accounts_number_token
  ON accounts(user_id, account_number_token)
  WHERE account_number_token IS NOT NULL;

-- Drop plaintext account number column (clean-slate: data is disposable)
ALTER TABLE accounts DROP COLUMN IF EXISTS schwab_account_number;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. uploaded_statements: remove large sensitive payloads, add retention
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop raw LLM response (full model output — no product need to retain)
ALTER TABLE uploaded_statements DROP COLUMN IF EXISTS raw_llm_response;

-- Drop verification raw response (same rationale)
ALTER TABLE uploaded_statements DROP COLUMN IF EXISTS verification_raw_response;

-- Drop detected_account_info (redundant with extracted_data, contains unmasked account numbers)
ALTER TABLE uploaded_statements DROP COLUMN IF EXISTS detected_account_info;

-- Add minimal debug context (replaces raw_llm_response for diagnostics)
ALTER TABLE uploaded_statements ADD COLUMN IF NOT EXISTS debug_context JSONB;

-- Add source file retention tracking
ALTER TABLE uploaded_statements ADD COLUMN IF NOT EXISTS source_file_expires_at TIMESTAMPTZ;
ALTER TABLE uploaded_statements ADD COLUMN IF NOT EXISTS source_file_purged_at TIMESTAMPTZ;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. extraction_failures: drop raw LLM response
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE extraction_failures DROP COLUMN IF EXISTS raw_llm_response;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. quality_checks: drop extraction_data snapshot (reference upload instead)
-- ═══════════════════════════════════════════════════════════════════════════

-- extraction_data duplicated the full extraction; reference uploaded_statements.extracted_data instead
ALTER TABLE quality_checks ALTER COLUMN extraction_data DROP NOT NULL;
ALTER TABLE quality_checks ALTER COLUMN extraction_data SET DEFAULT NULL;
