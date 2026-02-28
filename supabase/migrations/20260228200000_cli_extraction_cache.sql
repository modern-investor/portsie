-- CLI extraction cache: stores results from the DO CLI wrapper so they survive
-- Vercel timeouts. When the Vercel function times out but the Claude CLI process
-- on DO finishes, the wrapper saves the result here. On retry, the extract route
-- checks this table before starting a new extraction.
--
-- No RLS — accessed only via service role key (from CLI wrapper and Vercel API routes).

CREATE TABLE IF NOT EXISTS cli_extraction_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL,
  result JSONB NOT NULL,
  model TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cli_cache_upload_id ON cli_extraction_cache(upload_id);

-- Auto-cleanup: delete entries older than 1 hour (cron or manual, not built-in).
-- For now, the extract route deletes entries after consuming them.
COMMENT ON TABLE cli_extraction_cache IS 'Temporary cache for CLI wrapper extraction results that survive Vercel timeouts';
