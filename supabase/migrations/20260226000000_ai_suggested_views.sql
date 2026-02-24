-- AI-suggested portfolio views: per-user LLM-generated visualization suggestions
-- Each row stores a suggested view (from Gemini or Sonnet) with its Opus-generated
-- React component code. Includes built-in views like the correlation analysis.

CREATE TABLE IF NOT EXISTS ai_view_suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Which LLM suggested this view ('gemini' or 'sonnet')
  suggestion_provider TEXT NOT NULL CHECK (suggestion_provider IN ('gemini', 'sonnet')),

  -- Suggestion metadata (from Gemini/Sonnet)
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  chart_type TEXT NOT NULL,
  insight TEXT NOT NULL,
  data_spec TEXT,

  -- Opus-generated React component code
  component_code TEXT,
  code_generation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (code_generation_status IN ('pending', 'generating', 'complete', 'failed')),
  code_generation_error TEXT,

  -- Ordering within the provider's suggestions (0, 1, 2)
  suggestion_order INT NOT NULL DEFAULT 0,

  -- Built-in views (like correlation) use this flag
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  builtin_type TEXT,

  -- Correlation-specific data (JSON: matrix, diversityScore, pairs, clusters)
  correlation_data JSONB,

  -- SHA-256 of serialized portfolio data for cache invalidation
  portfolio_hash TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_views_user ON ai_view_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_views_builtin ON ai_view_suggestions(user_id, is_builtin) WHERE is_builtin = true;

ALTER TABLE ai_view_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai suggestions"
  ON ai_view_suggestions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai suggestions"
  ON ai_view_suggestions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai suggestions"
  ON ai_view_suggestions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ai suggestions"
  ON ai_view_suggestions FOR DELETE
  USING (auth.uid() = user_id);
