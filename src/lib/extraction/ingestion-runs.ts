import type { SupabaseClient } from "@supabase/supabase-js";

type RunKind = "upload" | "extract" | "confirm" | "verify" | "api_sync" | "webhook";
type RunStatus = "pending" | "running" | "completed" | "partial" | "failed";

interface StartRunInput {
  userId: string;
  sourceKey: string;
  runKind: RunKind;
  uploadedStatementId?: string;
  backend?: string;
  model?: string;
  diagnostics?: Record<string, unknown>;
}

interface CompleteRunInput {
  runId: string;
  status?: Extract<RunStatus, "completed" | "partial">;
  diagnostics?: Record<string, unknown>;
}

interface FailRunInput {
  runId: string;
  errorCategory?: string;
  errorMessage?: string;
  diagnostics?: Record<string, unknown>;
}

const runningSince = new Map<string, number>();

async function resolveSourceId(
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

export async function startIngestionRun(
  supabase: SupabaseClient,
  input: StartRunInput
): Promise<string | null> {
  try {
    const sourceId = await resolveSourceId(supabase, input.sourceKey);
    if (!sourceId) return null;

    const { data, error } = await supabase
      .from("ingestion_runs")
      .insert({
        user_id: input.userId,
        source_id: sourceId,
        uploaded_statement_id: input.uploadedStatementId ?? null,
        run_kind: input.runKind,
        status: "running",
        backend: input.backend ?? null,
        model: input.model ?? null,
        diagnostics: input.diagnostics ?? {},
      })
      .select("id")
      .single();

    if (error || !data) return null;
    runningSince.set(data.id, Date.now());
    return data.id;
  } catch {
    return null;
  }
}

export async function completeIngestionRun(
  supabase: SupabaseClient,
  input: CompleteRunInput
): Promise<void> {
  try {
    const startedAt = runningSince.get(input.runId);
    const durationMs = startedAt ? Date.now() - startedAt : null;

    await supabase
      .from("ingestion_runs")
      .update({
        status: input.status ?? "completed",
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        diagnostics: input.diagnostics ?? undefined,
      })
      .eq("id", input.runId);

    runningSince.delete(input.runId);
  } catch {
    // Intentionally non-fatal
  }
}

export async function failIngestionRun(
  supabase: SupabaseClient,
  input: FailRunInput
): Promise<void> {
  try {
    const startedAt = runningSince.get(input.runId);
    const durationMs = startedAt ? Date.now() - startedAt : null;

    await supabase
      .from("ingestion_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        error_category: input.errorCategory ?? null,
        error_message: input.errorMessage ?? null,
        diagnostics: input.diagnostics ?? undefined,
      })
      .eq("id", input.runId);

    runningSince.delete(input.runId);
  } catch {
    // Intentionally non-fatal
  }
}
