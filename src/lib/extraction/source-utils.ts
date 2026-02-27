import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Look up the UUID for an ingestion source by its stable key.
 * Returns null if the source doesn't exist or is disabled.
 */
export async function resolveSourceId(
  supabase: SupabaseClient,
  sourceKey: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("ingestion_sources")
    .select("id")
    .eq("key", sourceKey)
    .eq("enabled", true)
    .maybeSingle();

  if (error || !data) return null;
  return data.id;
}
