-- Add model_preference to waiting_list (byob = self-hosted, saas = hosted)
ALTER TABLE waiting_list
  ADD COLUMN IF NOT EXISTS model_preference TEXT;

-- Constraint: allowed values only
ALTER TABLE waiting_list
  DROP CONSTRAINT IF EXISTS waiting_list_model_preference_check;

ALTER TABLE waiting_list
  ADD CONSTRAINT waiting_list_model_preference_check
  CHECK (model_preference IS NULL OR model_preference IN ('byob', 'saas'));
