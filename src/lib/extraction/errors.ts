/**
 * Structured extraction error with classification for retry decisions,
 * user-facing messages, and diagnostics.
 */

export type ErrorCategory =
  | "timeout"
  | "llm_error"
  | "validation_error"
  | "integrity_failed"
  | "download_error"
  | "db_error"
  | "network_error"
  | "unknown";

export class ExtractionError extends Error {
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly userMessage: string;
  readonly technicalDetail: string;

  constructor(opts: {
    category: ErrorCategory;
    retryable: boolean;
    userMessage: string;
    technicalDetail: string;
  }) {
    super(opts.technicalDetail);
    this.name = "ExtractionError";
    this.category = opts.category;
    this.retryable = opts.retryable;
    this.userMessage = opts.userMessage;
    this.technicalDetail = opts.technicalDetail;
  }
}

/**
 * Classify a raw error into an ExtractionError with category and user message.
 * Call this in catch blocks to normalize errors before storage/display.
 */
export function classifyError(err: unknown, context?: string): ExtractionError {
  if (err instanceof ExtractionError) return err;

  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  // Timeout errors
  if (
    err instanceof Error && err.name === "AbortError" ||
    lower.includes("timeout") ||
    lower.includes("aborted") ||
    lower.includes("deadline exceeded")
  ) {
    return new ExtractionError({
      category: "timeout",
      retryable: true,
      userMessage: "Processing took too long. Try again or use a smaller file.",
      technicalDetail: `${context ? context + ": " : ""}${message}`,
    });
  }

  // Gemini/LLM rate limiting
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("resource exhausted")) {
    return new ExtractionError({
      category: "llm_error",
      retryable: true,
      userMessage: "AI service is temporarily busy. Please retry in a moment.",
      technicalDetail: `${context ? context + ": " : ""}${message}`,
    });
  }

  // LLM server errors (503, 500, etc.)
  if (lower.includes("503") || lower.includes("502") || lower.includes("500") || lower.includes("internal server error")) {
    return new ExtractionError({
      category: "llm_error",
      retryable: true,
      userMessage: "AI service encountered a temporary error. Please retry.",
      technicalDetail: `${context ? context + ": " : ""}${message}`,
    });
  }

  // LLM auth errors
  if (lower.includes("401") || lower.includes("403") || lower.includes("unauthorized") || lower.includes("forbidden")) {
    return new ExtractionError({
      category: "llm_error",
      retryable: false,
      userMessage: "AI service authentication failed. Check your settings.",
      technicalDetail: `${context ? context + ": " : ""}${message}`,
    });
  }

  // LLM bad request (prompt too long, unsupported file, etc.)
  if (lower.includes("400") || lower.includes("bad request") || lower.includes("invalid")) {
    return new ExtractionError({
      category: "llm_error",
      retryable: false,
      userMessage: "The AI could not process this file. Try a different format or smaller file.",
      technicalDetail: `${context ? context + ": " : ""}${message}`,
    });
  }

  // Schema validation failures
  if (lower.includes("validation failed") || lower.includes("schema")) {
    return new ExtractionError({
      category: "validation_error",
      retryable: false,
      userMessage: "AI returned data in an unexpected format. Try reprocessing with different settings.",
      technicalDetail: `${context ? context + ": " : ""}${message}`,
    });
  }

  // File download errors
  if (lower.includes("download") || lower.includes("storage")) {
    return new ExtractionError({
      category: "download_error",
      retryable: true,
      userMessage: "Could not download the file. Please retry.",
      technicalDetail: `${context ? context + ": " : ""}${message}`,
    });
  }

  // Network errors
  if (
    lower.includes("econnrefused") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("fetch failed") ||
    lower.includes("network")
  ) {
    return new ExtractionError({
      category: "network_error",
      retryable: true,
      userMessage: "Network error connecting to AI service. Please retry.",
      technicalDetail: `${context ? context + ": " : ""}${message}`,
    });
  }

  // Database errors
  if (lower.includes("database") || lower.includes("supabase") || lower.includes("postgres")) {
    return new ExtractionError({
      category: "db_error",
      retryable: true,
      userMessage: "Database error while saving data. Please retry.",
      technicalDetail: `${context ? context + ": " : ""}${message}`,
    });
  }

  // Unknown
  return new ExtractionError({
    category: "unknown",
    retryable: true,
    userMessage: "An unexpected error occurred. Please retry.",
    technicalDetail: `${context ? context + ": " : ""}${message}`,
  });
}
