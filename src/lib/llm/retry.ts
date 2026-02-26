/**
 * Retry wrapper for LLM backend fetch calls.
 * Retries on transient errors (429, 503) with exponential backoff + jitter.
 * Does NOT retry on client errors (400, 401, 403) or validation errors.
 */

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Base delay in ms before first retry. Default: 2000 */
  baseDelayMs?: number;
  /** Predicate: return true if the error should trigger a retry. */
  retryOn?: (err: unknown) => boolean;
  /** Optional label for logging. */
  label?: string;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 2000,
  retryOn: isTransientError,
  label: "retry",
};

/**
 * Default predicate: retry on 429, 502, 503 status codes,
 * ECONNRESET, ECONNREFUSED, and abort/timeout errors.
 */
export function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    // Don't retry abort errors — those are intentional timeouts
    false
  );
}

/**
 * Execute `fn` with retry logic on transient failures.
 *
 * Usage:
 * ```ts
 * const result = await withRetry(() => fetch(url, opts), {
 *   maxAttempts: 3,
 *   label: "Gemini",
 * });
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions
): Promise<T> {
  const { maxAttempts, baseDelayMs, retryOn, label } = { ...DEFAULT_OPTIONS, ...opts };

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt >= maxAttempts || !retryOn(err)) {
        throw err;
      }

      // Exponential backoff with jitter
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500;
      console.warn(
        `[${label}] Attempt ${attempt}/${maxAttempts} failed, retrying in ${Math.round(delay)}ms: ${err instanceof Error ? err.message : err}`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}
