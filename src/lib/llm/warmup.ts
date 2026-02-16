import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fire-and-forget warmup call to the CLI endpoint.
 * Pre-spawns a Claude process so it's ready when the real extraction comes.
 * Only triggers if user has CLI mode with a remote endpoint configured.
 */
export async function warmupCliEndpoint(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  // Get user's LLM settings to check for CLI endpoint
  const { data, error } = await supabase
    .from("llm_settings")
    .select("llm_mode, cli_endpoint")
    .eq("user_id", userId)
    .single();

  if (error || !data) return;
  if (data.llm_mode !== "cli" || !data.cli_endpoint) return;

  // Derive warmup URL from the extract endpoint
  // e.g., "http://159.89.157.120:8910/extract" → "http://159.89.157.120:8910/warmup"
  const warmupUrl = data.cli_endpoint.replace(/\/extract\/?$/, "/warmup");
  if (warmupUrl === data.cli_endpoint) {
    // Couldn't derive warmup URL — endpoint doesn't end in /extract
    return;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const authToken = process.env.PORTSIE_CLI_AUTH_TOKEN;
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  // Fire and forget — 5s timeout, don't care about response
  await fetch(warmupUrl, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(5000),
  });
}
