/**
 * Privacy cryptographic primitives.
 *
 * - AES-256-GCM field encryption with versioned ciphertext format
 * - HMAC-SHA256 deterministic tokenization with domain separation
 *
 * Versioned format (`v1.{iv}.{tag}.{ct}`) enables future key rotation.
 * Backward-compatible: detects unversioned blobs from the legacy
 * `encryptToken()`/`decryptToken()` in `src/lib/schwab/tokens.ts`.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "crypto";
import type { EncryptedField, TokenizedField } from "./types";

const ALGORITHM = "aes-256-gcm";
const CIPHERTEXT_VERSION = "v1";

// ── Key management ──

function getEncryptionKey(): Buffer {
  const key = process.env.SCHWAB_TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error("SCHWAB_TOKEN_ENCRYPTION_KEY not set");
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) throw new Error("SCHWAB_TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  return buf;
}

function getHmacKey(): Buffer {
  const key = process.env.PRIVACY_HMAC_KEY;
  if (!key) throw new Error("PRIVACY_HMAC_KEY not set");
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) throw new Error("PRIVACY_HMAC_KEY must be 64 hex characters (32 bytes)");
  return buf;
}

// ── Encryption ──

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns versioned ciphertext: `v1.{iv_b64}.{authTag_b64}.{ciphertext_b64}`
 */
export function encryptField(plaintext: string): EncryptedField {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  return `${CIPHERTEXT_VERSION}.${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted}` as EncryptedField;
}

/**
 * Decrypt a versioned or legacy ciphertext blob.
 *
 * Versioned format: `v1.{iv}.{authTag}.{ciphertext}`
 * Legacy format:    `{iv}.{authTag}.{ciphertext}` (from schwab/tokens.ts)
 */
export function decryptField(encryptedBlob: string): string {
  const key = getEncryptionKey();

  let ivB64: string;
  let authTagB64: string;
  let ciphertext: string;

  if (encryptedBlob.startsWith(`${CIPHERTEXT_VERSION}.`)) {
    // Versioned format
    const parts = encryptedBlob.split(".");
    if (parts.length !== 4) throw new Error("Invalid versioned encrypted field format");
    [, ivB64, authTagB64, ciphertext] = parts;
  } else {
    // Legacy format (backward-compatible with schwab/tokens.ts)
    const parts = encryptedBlob.split(".");
    if (parts.length !== 3) throw new Error("Invalid encrypted field format");
    [ivB64, authTagB64, ciphertext] = parts;
  }

  if (!ivB64 || !authTagB64) {
    throw new Error("Invalid encrypted field format: missing components");
  }
  // ciphertext can be empty for empty plaintext
  if (ciphertext === undefined) {
    throw new Error("Invalid encrypted field format: missing ciphertext");
  }

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ── Tokenization ──

/**
 * Produce a deterministic HMAC-SHA256 token for exact-match lookups.
 *
 * Domain separation ensures that the same plaintext value produces
 * different tokens in different contexts (e.g., account_number vs email).
 *
 * Returns a hex-encoded HMAC string prefixed with the domain.
 */
export function tokenize(value: string, domain: string): TokenizedField {
  const key = getHmacKey();
  const hmac = createHmac("sha256", key);
  hmac.update(`${domain}:${value}`);
  return `${domain}:${hmac.digest("hex")}` as TokenizedField;
}

/**
 * Convenience: tokenize an account number for lookup.
 * Strips non-digit characters before tokenizing for consistent matching.
 */
export function tokenizeAccountNumber(raw: string): TokenizedField {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return tokenize(raw, "account_number");
  return tokenize(digits, "account_number");
}

/**
 * Check if a blob looks like a versioned encrypted field.
 */
export function isEncryptedField(value: string): boolean {
  return value.startsWith(`${CIPHERTEXT_VERSION}.`) && value.split(".").length === 4;
}
