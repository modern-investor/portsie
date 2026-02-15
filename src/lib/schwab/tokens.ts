import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { SCHWAB_CONFIG } from "./config";
import type {
  SchwabTokenResponse,
  SchwabTokenRecord,
  DecryptedTokens,
} from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.SCHWAB_TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("SCHWAB_TOKEN_ENCRYPTION_KEY not set");
  return Buffer.from(key, "hex");
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  // Format: iv.authTag.ciphertext (all base64)
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted}`;
}

export function decryptToken(encryptedBlob: string): string {
  const key = getEncryptionKey();
  const [ivB64, authTagB64, ciphertext] = encryptedBlob.split(".");
  if (!ivB64 || !authTagB64 || !ciphertext) {
    throw new Error("Invalid encrypted token format");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function storeSchwabTokens(
  supabase: SupabaseClient,
  userId: string,
  tokenResponse: SchwabTokenResponse
): Promise<void> {
  const now = new Date();
  const accessTokenExpiresAt = new Date(
    now.getTime() + tokenResponse.expires_in * 1000
  );
  const refreshTokenExpiresAt = new Date(
    now.getTime() + SCHWAB_CONFIG.refreshTokenLifetimeMs
  );

  const { error } = await supabase.from("schwab_tokens").upsert(
    {
      user_id: userId,
      access_token_encrypted: encryptToken(tokenResponse.access_token),
      refresh_token_encrypted: encryptToken(tokenResponse.refresh_token),
      access_token_expires_at: accessTokenExpiresAt.toISOString(),
      refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) throw new Error(`Failed to store tokens: ${error.message}`);
}

export async function getSchwabTokens(
  supabase: SupabaseClient,
  userId: string
): Promise<DecryptedTokens | null> {
  const { data, error } = await supabase
    .from("schwab_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  const record = data as SchwabTokenRecord;
  return {
    accessToken: decryptToken(record.access_token_encrypted),
    refreshToken: decryptToken(record.refresh_token_encrypted),
    accessTokenExpiresAt: new Date(record.access_token_expires_at),
    refreshTokenExpiresAt: new Date(record.refresh_token_expires_at),
  };
}

export async function deleteSchwabTokens(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from("schwab_tokens")
    .delete()
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to delete tokens: ${error.message}`);
}

export async function hasSchwabConnection(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("schwab_tokens")
    .select("id, refresh_token_expires_at")
    .eq("user_id", userId)
    .single();

  if (!data) return false;

  // Check if refresh token is still valid
  const expiresAt = new Date(data.refresh_token_expires_at);
  return new Date() < expiresAt;
}
