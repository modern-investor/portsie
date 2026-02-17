-- Entities: represents account owners (self, spouse, trust, partner, etc.)
-- Each user gets a default "Personal" entity on first use.

CREATE TABLE entities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'personal'
    CHECK (entity_type IN ('personal', 'spouse', 'trust', 'partner', 'other')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, entity_name)
);

CREATE INDEX idx_entities_user_id ON entities(user_id);

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entities"
  ON entities FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own entities"
  ON entities FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own entities"
  ON entities FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own entities"
  ON entities FOR DELETE USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_entities_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
