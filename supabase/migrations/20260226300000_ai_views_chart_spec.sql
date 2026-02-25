-- Add declarative chart_spec column to ai_view_suggestions.
-- This replaces the component_code (executable JS) approach with safe JSON specs.

ALTER TABLE ai_view_suggestions
  ADD COLUMN IF NOT EXISTS chart_spec JSONB;

COMMENT ON COLUMN ai_view_suggestions.chart_spec IS
  'Declarative chart specification JSON. Replaces component_code for safe rendering.';
