export const FINNHUB_CONFIG = {
  baseUrl: "https://finnhub.io/api/v1",
  // Free tier: 60 API calls/minute
  maxRequestsPerMinute: 60,
} as const;

export const ALPHA_VANTAGE_CONFIG = {
  baseUrl: "https://www.alphavantage.co/query",
  // Free tier: 25 API calls/day
  maxRequestsPerDay: 25,
} as const;
