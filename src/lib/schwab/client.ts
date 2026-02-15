import { SCHWAB_CONFIG } from "./config";
import { getSchwabTokens, storeSchwabTokens } from "./tokens";
import type {
  SchwabTokenResponse,
  SchwabAccountNumber,
  SchwabAccount,
  SchwabQuote,
} from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

export class SchwabApiError extends Error {
  constructor(
    public status: number,
    public body: string
  ) {
    super(`Schwab API error ${status}: ${body}`);
    this.name = "SchwabApiError";
  }
}

// --- OAuth helpers (static, no instance needed) ---

export class SchwabAuth {
  static getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: process.env.SCHWAB_APP_KEY!,
      redirect_uri: process.env.SCHWAB_CALLBACK_URL!,
    });
    if (state) params.set("state", state);
    return `${SCHWAB_CONFIG.authorizationUrl}?${params}`;
  }

  static async exchangeCode(code: string): Promise<SchwabTokenResponse> {
    const credentials = Buffer.from(
      `${process.env.SCHWAB_APP_KEY}:${process.env.SCHWAB_APP_SECRET}`
    ).toString("base64");

    const response = await fetch(SCHWAB_CONFIG.tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.SCHWAB_CALLBACK_URL!,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new SchwabApiError(response.status, error);
    }

    return response.json();
  }

  static async refreshAccessToken(
    refreshToken: string
  ): Promise<SchwabTokenResponse> {
    const credentials = Buffer.from(
      `${process.env.SCHWAB_APP_KEY}:${process.env.SCHWAB_APP_SECRET}`
    ).toString("base64");

    const response = await fetch(SCHWAB_CONFIG.tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new SchwabApiError(response.status, error);
    }

    return response.json();
  }
}

// --- Token lifecycle helper ---

export async function getValidAccessToken(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const tokens = await getSchwabTokens(supabase, userId);
  if (!tokens) throw new Error("SCHWAB_NOT_CONNECTED");

  if (new Date() >= tokens.refreshTokenExpiresAt) {
    throw new Error("SCHWAB_REFRESH_EXPIRED");
  }

  const bufferMs = SCHWAB_CONFIG.accessTokenRefreshBufferMs;
  const needsRefresh =
    new Date() >= new Date(tokens.accessTokenExpiresAt.getTime() - bufferMs);

  if (needsRefresh) {
    const newTokens = await SchwabAuth.refreshAccessToken(tokens.refreshToken);
    await storeSchwabTokens(supabase, userId, newTokens);
    return newTokens.access_token;
  }

  return tokens.accessToken;
}

// --- API client for data fetching ---

export class SchwabApiClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new SchwabApiError(response.status, errorBody);
    }

    return response.json() as Promise<T>;
  }

  async getAccountNumbers(): Promise<SchwabAccountNumber[]> {
    return this.fetch(
      `${SCHWAB_CONFIG.traderBaseUrl}/accounts/accountNumbers`
    );
  }

  async getAccounts(fields?: string): Promise<SchwabAccount[]> {
    const params = fields ? `?fields=${fields}` : "";
    return this.fetch(`${SCHWAB_CONFIG.traderBaseUrl}/accounts${params}`);
  }

  async getAccount(accountHash: string, fields?: string): Promise<SchwabAccount> {
    const params = fields ? `?fields=${fields}` : "";
    return this.fetch(
      `${SCHWAB_CONFIG.traderBaseUrl}/accounts/${accountHash}${params}`
    );
  }

  async getQuotes(symbols: string[]): Promise<Record<string, SchwabQuote>> {
    const params = new URLSearchParams({ symbols: symbols.join(",") });
    return this.fetch(
      `${SCHWAB_CONFIG.marketDataBaseUrl}/quotes?${params}`
    );
  }

  async getQuote(symbol: string): Promise<Record<string, SchwabQuote>> {
    return this.fetch(
      `${SCHWAB_CONFIG.marketDataBaseUrl}/${symbol}/quotes`
    );
  }
}
