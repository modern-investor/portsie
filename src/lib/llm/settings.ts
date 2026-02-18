import { encryptToken, decryptToken } from "../schwab/tokens";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LLMMode, LLMSettings, LLMSettingsRecord } from "./types";

/**
 * Store or update LLM settings for a user.
 * Uses upsert on user_id conflict (same pattern as Schwab credentials).
 */
export async function storeLLMSettings(
  supabase: SupabaseClient,
  userId: string,
  llmMode: LLMMode,
  apiKey: string | null,
  cliEndpoint: string | null
): Promise<void> {
  // If apiKey is provided, encrypt it. If null, we need to preserve existing key.
  let apiKeyEncrypted: string | null | undefined;
  if (apiKey !== null) {
    apiKeyEncrypted = encryptToken(apiKey);
  } else {
    // Check if there's an existing key to preserve
    const { data: existing } = await supabase
      .from("llm_settings")
      .select("api_key_encrypted")
      .eq("user_id", userId)
      .single();
    apiKeyEncrypted = existing?.api_key_encrypted ?? null;
  }

  const { error } = await supabase.from("llm_settings").upsert(
    {
      user_id: userId,
      llm_mode: llmMode,
      api_key_encrypted: apiKeyEncrypted,
      cli_endpoint: cliEndpoint,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) throw new Error(`Failed to store LLM settings: ${error.message}`);
}

/**
 * Get public-facing LLM settings (no raw API key exposed).
 */
export async function getLLMSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<LLMSettings | null> {
  const { data, error } = await supabase
    .from("llm_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  const record = data as LLMSettingsRecord;
  return {
    llmMode: record.llm_mode,
    hasApiKey: !!record.api_key_encrypted,
    cliEndpoint: record.cli_endpoint,
  };
}

/**
 * Get the decrypted API key (server-side only, never expose to client).
 */
export async function getLLMApiKey(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("llm_settings")
    .select("api_key_encrypted")
    .eq("user_id", userId)
    .single();

  if (error || !data || !data.api_key_encrypted) return null;
  return decryptToken(data.api_key_encrypted);
}

/**
 * Get the CLI endpoint URL (null means local subprocess).
 */
export async function getLLMCliEndpoint(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("llm_settings")
    .select("cli_endpoint")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data.cli_endpoint;
}

/**
 * Delete the API key and revert to CLI mode.
 */
export async function deleteLLMApiKey(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from("llm_settings")
    .update({
      api_key_encrypted: null,
      llm_mode: "gemini",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to delete API key: ${error.message}`);
}
