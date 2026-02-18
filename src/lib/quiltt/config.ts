// ============================================================================
// Quiltt API configuration constants
// ============================================================================

export const QUILTT_CONFIG = {
  /** REST auth endpoint for creating/revoking session tokens */
  authBaseUrl: "https://auth.quiltt.io/v1",

  /** GraphQL endpoint for data queries */
  graphqlUrl: "https://api.quiltt.io/v1/graphql",

  /** Session token TTL (24 hours) */
  sessionTtlMs: 24 * 60 * 60 * 1000,

  /** Webhook timestamp tolerance (5 minutes) */
  webhookTimestampToleranceMs: 5 * 60 * 1000,

  /** Webhook signature version prefix */
  webhookSignatureVersion: "1",
} as const;

export function getQuilttApiSecret(): string {
  const secret = process.env.QUILTT_API_SECRET;
  if (!secret) throw new Error("QUILTT_API_SECRET not set");
  return secret;
}

export function getQuilttWebhookSecret(): string {
  const secret = process.env.QUILTT_WEBHOOK_SECRET;
  if (!secret) throw new Error("QUILTT_WEBHOOK_SECRET not set");
  return secret;
}
