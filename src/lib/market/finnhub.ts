import { FINNHUB_CONFIG } from "./config";
import type { FinnhubQuoteResponse, MarketQuote } from "./types";

export class FinnhubClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch a single stock quote via Finnhub /quote endpoint.
   * Returns null if the symbol is not found or rate-limited.
   */
  async getQuote(symbol: string): Promise<MarketQuote | null> {
    const url = `${FINNHUB_CONFIG.baseUrl}/quote?symbol=${encodeURIComponent(symbol)}&token=${this.apiKey}`;

    const response = await fetch(url);

    if (response.status === 429) {
      console.warn("Finnhub rate limit hit");
      return null;
    }

    if (!response.ok) {
      console.error(`Finnhub error ${response.status} for ${symbol}`);
      return null;
    }

    const data: FinnhubQuoteResponse = await response.json();

    // Finnhub returns all zeros when a symbol is not found
    if (data.c === 0 && data.h === 0 && data.l === 0 && data.o === 0) {
      return null;
    }

    // Convert unix timestamp to YYYY-MM-DD (US Eastern market time)
    const tradingDay = data.t
      ? new Date(data.t * 1000).toLocaleDateString("en-CA", {
          timeZone: "America/New_York",
        })
      : new Date().toLocaleDateString("en-CA", {
          timeZone: "America/New_York",
        });

    return {
      symbol,
      open: data.o,
      high: data.h,
      low: data.l,
      price: data.c,
      volume: 0, // Finnhub /quote doesn't include volume
      tradingDay,
      previousClose: data.pc,
      change: data.d,
      changePercent: data.dp,
    };
  }
}
