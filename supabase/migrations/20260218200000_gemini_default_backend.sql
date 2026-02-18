-- Switch default LLM backend from CLI to Gemini 3 Flash.
-- Adds 'gemini' to the allowed modes and changes the column default.

-- Drop the existing check constraint and recreate with 'gemini' included
ALTER TABLE llm_settings
  DROP CONSTRAINT IF EXISTS llm_settings_llm_mode_check;

ALTER TABLE llm_settings
  ADD CONSTRAINT llm_settings_llm_mode_check
  CHECK (llm_mode IN ('gemini', 'cli', 'api'));

-- Change the default for new rows
ALTER TABLE llm_settings
  ALTER COLUMN llm_mode SET DEFAULT 'gemini';
