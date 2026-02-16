-- Style guide: global design tokens (singleton config row)
-- Stores colors, fonts, font sizes, spacing, and border radii
-- NOT per-user — this is a shared app config

CREATE TABLE style_guide (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  colors JSONB NOT NULL DEFAULT '{}'::jsonb,
  fonts JSONB NOT NULL DEFAULT '{}'::jsonb,
  font_sizes JSONB NOT NULL DEFAULT '{}'::jsonb,
  spacing JSONB NOT NULL DEFAULT '{}'::jsonb,
  radii JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE style_guide ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view style guide"
  ON style_guide FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Service role can insert style guide"
  ON style_guide FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update style guide"
  ON style_guide FOR UPDATE
  TO service_role
  USING (true);

CREATE TRIGGER update_style_guide_updated_at
  BEFORE UPDATE ON style_guide
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
