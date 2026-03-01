-- Change verification defaults from Claude Sonnet CLI to Gemini 2.5 Flash
ALTER TABLE llm_settings
  ALTER COLUMN verification_backend SET DEFAULT 'gemini',
  ALTER COLUMN verification_model SET DEFAULT 'gemini-2.5-flash';
