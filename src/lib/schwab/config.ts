export const SCHWAB_CONFIG = {
  authorizationUrl: "https://api.schwabapi.com/v1/oauth/authorize",
  tokenUrl: "https://api.schwabapi.com/v1/oauth/token",
  traderBaseUrl: "https://api.schwabapi.com/trader/v1",
  marketDataBaseUrl: "https://api.schwabapi.com/marketdata/v1",
  accessTokenLifetimeMs: 30 * 60 * 1000,
  refreshTokenLifetimeMs: 7 * 24 * 60 * 60 * 1000,
  accessTokenRefreshBufferMs: 2 * 60 * 1000,
} as const;
