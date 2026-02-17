export type EntityType = "personal" | "spouse" | "trust" | "partner" | "other";

export interface Entity {
  id: string;
  user_id: string;
  entity_name: string;
  entity_type: EntityType;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}
