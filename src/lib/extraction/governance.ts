import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValidationObservation } from "./schema";
import { resolveSourceId } from "./source-utils";

export async function recordStructureSignature(
  supabase: SupabaseClient,
  sourceKey: string,
  structureSignature: string,
  schemaVersion = 1,
  samplePayload?: unknown
): Promise<void> {
  try {
    const sourceId = await resolveSourceId(supabase, sourceKey);
    if (!sourceId || !structureSignature) return;

    const { data: existing } = await supabase
      .from("source_schema_registry")
      .select("id, seen_count")
      .eq("source_id", sourceId)
      .eq("structure_signature", structureSignature)
      .eq("schema_version", schemaVersion)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("source_schema_registry")
        .update({
          last_seen_at: new Date().toISOString(),
          seen_count: (existing.seen_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      return;
    }

    await supabase.from("source_schema_registry").insert({
      source_id: sourceId,
      structure_signature: structureSignature,
      schema_version: schemaVersion,
      sample_payload: samplePayload ?? null,
    });
  } catch {
    // Non-fatal observability path
  }
}

export async function persistObservations(
  supabase: SupabaseClient,
  input: {
    ingestionRunId: string | null;
    userId: string;
    sourceKey: string;
    observations: ValidationObservation[];
    maxRows?: number;
  }
): Promise<void> {
  if (!input.ingestionRunId || input.observations.length === 0) return;

  try {
    const sourceId = await resolveSourceId(supabase, input.sourceKey);
    if (!sourceId) return;

    const capped = input.observations.slice(0, input.maxRows ?? 100);
    await supabase.from("ingestion_observations").insert(
      capped.map((obs) => ({
        ingestion_run_id: input.ingestionRunId,
        user_id: input.userId,
        source_id: sourceId,
        field_path: obs.path,
        observed_type: obs.value === null ? "null" : typeof obs.value,
        observed_value: obs.value ?? null,
        confidence: obs.confidence,
      }))
    );
  } catch {
    // Non-fatal observability path
  }
}
