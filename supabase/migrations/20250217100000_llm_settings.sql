-- LLM settings: per-user configuration for document extraction backend
-- Supports toggling between CLI mode (Claude Code CLI / Max plan) and API mode (Anthropic API key)

CREATE TABLE llm_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Backend mode: 'cli' uses claude -p (Max plan), 'api' uses @anthropic-ai/sdk
  llm_mode TEXT NOT NULL DEFAULT 'cli' CHECK (llm_mode IN ('cli', 'api')),

  -- Encrypted Anthropic API key (only needed for API mode)
  api_key_encrypted TEXT,

  -- Optional remote CLI endpoint URL (null = local subprocess)
  cli_endpoint TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id)
);

CREATE INDEX idx_llm_settings_user_id ON llm_settings(user_id);

ALTER TABLE llm_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own llm settings"
  ON llm_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own llm settings"
  ON llm_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own llm settings"
  ON llm_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own llm settings"
  ON llm_settings FOR DELETE
  USING (auth.uid() = user_id);
