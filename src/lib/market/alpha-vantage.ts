import { ALPHA_VANTAGE_CONFIG } from "./config";
import type { AlphaVantageGlobalQuote, MarketQuote } from "./types";

export class AlphaVantageClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch a single stock quote via GLOBAL_QUOTE endpoint.
   * Returns null if the symbol is not found or rate-limited.
   */
  async getQuote(symbol: string): Promise<MarketQuote | null> {
    const params = new URLSearchParams({
      function: "GLOBAL_QUOTE",
      symbol,
      apikey: this.apiKey,
    });

    const response = await fetch(
      `${ALPHA_VANTAGE_CONFIG.baseUrl}?${params}`
    );

    if (!response.ok) {
      console.error(`Alpha Vantage error ${response.status} for ${symbol}`);
      return null;
    }

    const data: AlphaVantageGlobalQuote & {
      Note?: string;
      Information?: string;
    } = await response.json();

    // Rate limit hit — Alpha Vantage returns a "Note" field
    if (data.Note || data.Information) {
      console.warn(
        "Alpha Vantage rate limit or info:",
        data.Note || data.Information
      );
      return null;
    }

    const gq = data["Global Quote"];
    if (!gq || !gq["01. symbol"]) {
      return null;
    }

    return {
      symbol: gq["01. symbol"],
      open: parseFloat(gq["02. open"]) || 0,
      high: parseFloat(gq["03. high"]) || 0,
      low: parseFloat(gq["04. low"]) || 0,
      price: parseFloat(gq["05. price"]) || 0,
      volume: parseInt(gq["06. volume"], 10) || 0,
      tradingDay: gq["07. latest trading day"],
      previousClose: parseFloat(gq["08. previous close"]) || 0,
      change: parseFloat(gq["09. change"]) || 0,
      changePercent:
        parseFloat(gq["10. change percent"]?.replace("%", "")) || 0,
    };
  }
}
