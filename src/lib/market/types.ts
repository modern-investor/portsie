/** Normalized quote result from any market data provider. */
export interface MarketQuote {
  symbol: string;
  open: number;
  high: number;
  low: number;
  price: number; // current / close price
  volume: number;
  tradingDay: string; // YYYY-MM-DD
  previousClose: number;
  change: number;
  changePercent: number;
}

/** Result of a price refresh operation. */
export interface PriceRefreshResult {
  updated: string[]; // symbols fetched and updated
  cached: string[]; // symbols already had today's price
  failed: string[]; // symbols that failed to fetch
  skipped: string[]; // symbols skipped (non-tradeable, rate limited)
  requestsUsed: number;
}

/** Row shape for the market_prices table. */
export interface MarketPriceRow {
  symbol: string;
  price_date: string;
  open_price: number | null;
  high_price: number | null;
  low_price: number | null;
  close_price: number;
  adjusted_close: number | null;
  volume: number | null;
  source: string;
}

/** Finnhub /quote response shape. */
export interface FinnhubQuoteResponse {
  c: number; // current price
  d: number; // change
  dp: number; // percent change
  h: number; // high
  l: number; // low
  o: number; // open
  pc: number; // previous close
  t: number; // timestamp (unix)
}

/** Alpha Vantage GLOBAL_QUOTE response shape. */
export interface AlphaVantageGlobalQuote {
  "Global Quote": {
    "01. symbol": string;
    "02. open": string;
    "03. high": string;
    "04. low": string;
    "05. price": string;
    "06. volume": string;
    "07. latest trading day": string;
    "08. previous close": string;
    "09. change": string;
    "10. change percent": string;
  };
}
