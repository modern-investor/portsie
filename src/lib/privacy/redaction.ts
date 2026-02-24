/**
 * Redaction utilities for safe logging and API serialization.
 *
 * - Field denylist for automatic redaction in logs
 * - Account number / email masking helpers
 * - `safeLog()` wrapper that auto-redacts sensitive data
 */

/** Fields that must never appear in logs or non-essential API responses. */
const SENSITIVE_FIELD_DENYLIST = new Set([
  "account_number",
  "schwab_account_number",
  "account_number_encrypted",
  "api_key",
  "api_key_encrypted",
  "access_token",
  "access_token_encrypted",
  "refresh_token",
  "refresh_token_encrypted",
  "app_key",
  "app_key_encrypted",
  "app_secret",
  "app_secret_encrypted",
  "raw_llm_response",
  "verification_raw_response",
  "base64Data",
  "password",
  "secret",
]);

/**
 * Deep-clone an object and replace sensitive field values with `[REDACTED]`.
 * Handles nested objects and arrays. Safe for circular references (max depth).
 */
export function redactForLog(obj: unknown, maxDepth = 10): unknown {
  if (maxDepth <= 0) return "[MAX_DEPTH]";
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return obj;
  if (typeof obj === "number" || typeof obj === "boolean") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactForLog(item, maxDepth - 1));
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_FIELD_DENYLIST.has(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactForLog(value, maxDepth - 1);
      }
    }
    return result;
  }

  return String(obj);
}

/**
 * Mask an account number, showing only the last 4 digits.
 * Returns `"...XXXX"` or `"[no account number]"` if empty.
 */
export function redactAccountNumber(num: string | null | undefined): string {
  if (!num) return "[no account number]";
  const digits = num.replace(/\D/g, "");
  if (digits.length <= 4) return `...${digits}`;
  return `...${digits.slice(-4)}`;
}

/**
 * Mask an email address for admin display.
 * `"rahul@example.com"` → `"r***@e***.com"`
 */
export function redactEmail(email: string | null | undefined): string {
  if (!email) return "[no email]";
  const [local, domain] = email.split("@");
  if (!domain) return `${email.charAt(0)}***`;
  const domainParts = domain.split(".");
  const tld = domainParts.pop() ?? "";
  const domainBase = domainParts.join(".");
  return `${local.charAt(0)}***@${domainBase.charAt(0)}***.${tld}`;
}

/**
 * Structured logging wrapper with automatic sensitive field redaction.
 *
 * Usage:
 *   safeLog("error", "Extract", "LLM extraction failed", { error, uploadId })
 */
export function safeLog(
  level: "info" | "warn" | "error",
  tag: string,
  message: string,
  data?: unknown
): void {
  const prefix = `[${tag}]`;
  const safeData = data !== undefined ? redactForLog(data) : undefined;

  if (safeData !== undefined) {
    console[level](prefix, message, safeData);
  } else {
    console[level](prefix, message);
  }
}
