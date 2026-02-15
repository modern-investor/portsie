import { encryptToken, decryptToken } from "./tokens";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SchwabCredentials {
  appKey: string;
  appSecret: string;
}

interface SchwabCredentialRecord {
  id: string;
  user_id: string;
  app_key_encrypted: string;
  app_secret_encrypted: string;
  created_at: string;
  updated_at: string;
}

export async function storeSchwabCredentials(
  supabase: SupabaseClient,
  userId: string,
  appKey: string,
  appSecret: string
): Promise<void> {
  const { error } = await supabase.from("schwab_credentials").upsert(
    {
      user_id: userId,
      app_key_encrypted: encryptToken(appKey),
      app_secret_encrypted: encryptToken(appSecret),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) throw new Error(`Failed to store credentials: ${error.message}`);
}

export async function getSchwabCredentials(
  supabase: SupabaseClient,
  userId: string
): Promise<SchwabCredentials | null> {
  const { data, error } = await supabase
    .from("schwab_credentials")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  const record = data as SchwabCredentialRecord;
  return {
    appKey: decryptToken(record.app_key_encrypted),
    appSecret: decryptToken(record.app_secret_encrypted),
  };
}

export async function deleteSchwabCredentials(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from("schwab_credentials")
    .delete()
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to delete credentials: ${error.message}`);
}

export async function hasSchwabCredentials(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("schwab_credentials")
    .select("id")
    .eq("user_id", userId)
    .single();

  return !!data;
}
