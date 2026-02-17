import type { SupabaseClient } from "@supabase/supabase-js";
import type { Entity } from "./types";

/**
 * Finds an existing entity that matches the detected account owner name.
 * Returns the matched entity (or default) and whether this is a new owner.
 */
export async function findMatchingEntity(
  supabase: SupabaseClient,
  userId: string,
  ownerName: string | null | undefined
): Promise<{ entity: Entity | null; isNewOwner: boolean }> {
  const { data: entities } = await supabase
    .from("entities")
    .select("*")
    .eq("user_id", userId);

  if (!entities || entities.length === 0) {
    // No entities at all — signal new owner only if name was provided
    return { entity: null, isNewOwner: !!ownerName };
  }

  // No owner name detected — return the default entity
  if (!ownerName) {
    const defaultEntity = entities.find((e) => e.is_default) ?? entities[0];
    return { entity: defaultEntity, isNewOwner: false };
  }

  const normalizedOwner = ownerName.toLowerCase().trim();

  // Exact match
  const exact = entities.find(
    (e) => e.entity_name.toLowerCase().trim() === normalizedOwner
  );
  if (exact) return { entity: exact, isNewOwner: false };

  // Partial match (owner name contains entity name or vice versa)
  const partial = entities.find(
    (e) =>
      normalizedOwner.includes(e.entity_name.toLowerCase().trim()) ||
      e.entity_name.toLowerCase().trim().includes(normalizedOwner)
  );
  if (partial) return { entity: partial, isNewOwner: false };

  // No match — new owner detected
  return { entity: null, isNewOwner: true };
}
