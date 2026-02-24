-- Store provider-level generation errors so they persist across page reloads.
-- The generate route stores the error JSON on every row in the batch;
-- the GET route reads it from the first row and includes it in the response.

ALTER TABLE ai_view_suggestions
  ADD COLUMN IF NOT EXISTS generation_errors JSONB;
