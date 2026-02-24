/**
 * Privacy module type definitions.
 *
 * Branded types for encrypted and tokenized fields prevent
 * accidental mixing of plaintext and ciphertext at the type level.
 */

// ── Branded types ──

/** AES-256-GCM encrypted field. Format: `v1.{iv}.{authTag}.{ciphertext}` (all base64). */
export type EncryptedField = string & { readonly __brand: "EncryptedField" };

/** HMAC-SHA256 deterministic token. Domain-separated for exact-match lookups. */
export type TokenizedField = string & { readonly __brand: "TokenizedField" };

// ── Privacy mode ──

export type PrivacyMode = "strict" | "standard";

export interface PrivacyConfig {
  mode: PrivacyMode;
  /** Whether to persist raw LLM responses in uploaded_statements */
  retainRawLLMResponse: boolean;
  /** Whether to persist verification extraction data */
  retainVerificationData: boolean;
  /** Default source file retention in days (0 = indefinite) */
  sourceFileRetentionDays: number;
  /** Logging verbosity for sensitive paths */
  debugVerbosity: "minimal" | "normal";
}

// ── Debug context (replaces raw_llm_response in strict mode) ──

export interface DebugContext {
  /** Which LLM backend was used */
  backend: string;
  /** Model identifier */
  model: string;
  /** Extraction duration in ms */
  durationMs: number;
  /** Approximate input token count (if available) */
  inputTokens?: number;
  /** Approximate output token count (if available) */
  outputTokens?: number;
  /** Timestamp of extraction */
  extractedAt: string;
  /** Processing preset used */
  preset?: string;
}
