// Upload feature configuration

export const UPLOAD_CONFIG = {
  /** Maximum file size in bytes (50 MB — matches Supabase Storage bucket limit) */
  maxFileSizeBytes: 50 * 1024 * 1024,

  /** Allowed MIME types for client-side validation */
  allowedMimeTypes: [
    "application/pdf",
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "image/png",
    "image/jpeg",
    "application/x-ofx",
    "application/x-qfx",
    "application/json",
  ] as const,

  /** Human-readable accept string for file inputs */
  acceptString:
    ".pdf,.csv,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.ofx,.qfx,.json",

  /** Claude model used for extraction (Sonnet for cost/quality balance) */
  claudeModel: "claude-sonnet-4-20250514" as const,

  /** Max tokens for Claude response (32K for multi-account summaries with many positions) */
  claudeMaxTokens: 32768,
} as const;
