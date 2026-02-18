-- Fix: drop ALL check constraints on llm_mode (name may differ from expected)
-- and recreate with 'gemini' included.

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Find and drop all check constraints on the llm_settings table
  -- that reference llm_mode
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'llm_settings'
      AND nsp.nspname = 'public'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%llm_mode%'
  LOOP
    EXECUTE format('ALTER TABLE public.llm_settings DROP CONSTRAINT %I', r.conname);
  END LOOP;
END
$$;

-- Add the updated constraint with gemini included
ALTER TABLE llm_settings
  ADD CONSTRAINT llm_settings_llm_mode_check
  CHECK (llm_mode IN ('gemini', 'cli', 'api'));

-- Change the default for new rows
ALTER TABLE llm_settings
  ALTER COLUMN llm_mode SET DEFAULT 'gemini';
