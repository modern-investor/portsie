-- Add processing_settings column to store what model/thinking/resolution was used
ALTER TABLE uploaded_statements
  ADD COLUMN IF NOT EXISTS processing_settings JSONB;

COMMENT ON COLUMN uploaded_statements.processing_settings IS
  'ProcessingSettings JSON — preset, model, thinkingLevel, mediaResolution used for this extraction';
