-- Add dual-model verification support
-- Primary extraction stays in extracted_data; verification result stored separately

-- Verification columns on uploaded_statements
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS verification_data JSONB,
  ADD COLUMN IF NOT EXISTS verification_raw_response JSONB,
  ADD COLUMN IF NOT EXISTS verification_settings JSONB,
  ADD COLUMN IF NOT EXISTS verification_error TEXT;

COMMENT ON COLUMN uploaded_statements.verification_data IS
  'PortsieExtraction JSON from verification model (second independent extraction)';
COMMENT ON COLUMN uploaded_statements.verification_settings IS
  'Model/backend settings used for verification extraction, e.g. {"backend":"cli","model":"claude-sonnet-4-6"}';
COMMENT ON COLUMN uploaded_statements.verification_error IS
  'Error message if verification extraction failed (primary still valid)';

-- Verification settings on llm_settings
ALTER TABLE llm_settings
  ADD COLUMN IF NOT EXISTS verification_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS verification_backend TEXT NOT NULL DEFAULT 'cli',
  ADD COLUMN IF NOT EXISTS verification_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6';

-- Constrain verification_backend to known backends
DO $$ BEGIN
  ALTER TABLE llm_settings
    ADD CONSTRAINT llm_settings_verification_backend_check
    CHECK (verification_backend IN ('gemini', 'cli'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
