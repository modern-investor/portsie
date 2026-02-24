import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { FinnhubClient } from "./finnhub";
import { AlphaVantageClient } from "./alpha-vantage";
import type { MarketQuote, MarketPriceRow, PriceRefreshResult } from "./types";

// Symbols that should not be sent to market data APIs
const SKIP_SYMBOLS = new Set(["CASH", "UNKNOWN", ""]);

/**
 * Get today's date in YYYY-MM-DD using US Eastern time (market close at 4pm ET).
 */
function getTodayMarketDate(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
}

/**
 * Refresh market prices for all tradeable symbols held by a user.
 *
 * Strategy:
 * 1. Query holdings for distinct tradeable symbols
 * 2. Check market_prices for symbols already fetched today → cached
 * 3. Fetch remaining via Finnhub (primary, 60/min) → Alpha Vantage fallback (25/day)
 * 4. Upsert into market_prices (service_role)
 * 5. Update holdings with new prices
 */
export async function refreshPrices(
  userSupabase: SupabaseClient,
  userId: string
): Promise<PriceRefreshResult> {
  const adminClient = createAdminClient();
  const today = getTodayMarketDate();

  const result: PriceRefreshResult = {
    updated: [],
    cached: [],
    failed: [],
    skipped: [],
    requestsUsed: 0,
  };

  // 1. Get distinct tradeable symbols from user's holdings
  const { data: holdings } = await userSupabase
    .from("holdings")
    .select("id, symbol, quantity, asset_category")
    .eq("user_id", userId)
    .gt("quantity", 0);

  if (!holdings || holdings.length === 0) {
    return result;
  }

  const tradeableSymbols = new Set<string>();
  for (const h of holdings) {
    if (
      h.symbol &&
      h.asset_category === "tradeable" &&
      !SKIP_SYMBOLS.has(h.symbol.toUpperCase())
    ) {
      tradeableSymbols.add(h.symbol.toUpperCase());
    }
  }

  if (tradeableSymbols.size === 0) {
    return result;
  }

  // 2. Check which symbols already have today's price in market_prices
  const symbolsArray = Array.from(tradeableSymbols);
  const { data: existingPrices } = await adminClient
    .from("market_prices")
    .select("symbol, close_price, price_date")
    .in("symbol", symbolsArray)
    .eq("price_date", today);

  const cachedPrices = new Map<string, number>();
  for (const p of existingPrices ?? []) {
    cachedPrices.set(p.symbol, Number(p.close_price));
    result.cached.push(p.symbol);
  }

  // 3. Determine which symbols still need fetching
  const symbolsToFetch = symbolsArray.filter((s) => !cachedPrices.has(s));

  if (symbolsToFetch.length === 0) {
    // All cached — just update holdings from cache
    await updateHoldingsWithPrices(userSupabase, userId, holdings, cachedPrices, today);
    return result;
  }

  // 4. Fetch from Finnhub (primary) with Alpha Vantage fallback
  const finnhubKey = process.env.FINNHUB_API_KEY;
  const avKey = process.env.ALPHA_VANTAGE_API_KEY;
  const finnhub = finnhubKey ? new FinnhubClient(finnhubKey) : null;
  const alphaVantage = avKey ? new AlphaVantageClient(avKey) : null;

  if (!finnhub && !alphaVantage) {
    result.skipped = symbolsToFetch;
    await updateHoldingsWithPrices(userSupabase, userId, holdings, cachedPrices, today);
    return result;
  }

  const freshQuotes = new Map<string, MarketQuote>();

  for (const symbol of symbolsToFetch) {
    let quote: MarketQuote | null = null;

    // Try Finnhub first
    if (finnhub) {
      try {
        quote = await finnhub.getQuote(symbol);
        result.requestsUsed++;
      } catch (err) {
        console.error(`Finnhub fetch failed for ${symbol}:`, err);
      }
    }

    // Fall back to Alpha Vantage if Finnhub returned nothing
    if (!quote && alphaVantage) {
      try {
        quote = await alphaVantage.getQuote(symbol);
        result.requestsUsed++;
      } catch (err) {
        console.error(`Alpha Vantage fetch failed for ${symbol}:`, err);
      }
    }

    if (quote && quote.price > 0) {
      freshQuotes.set(symbol, quote);
      result.updated.push(symbol);
    } else {
      result.failed.push(symbol);
    }
  }

  // 5. Upsert fresh quotes into market_prices (service_role required)
  if (freshQuotes.size > 0) {
    const rows: MarketPriceRow[] = [];
    for (const [, quote] of freshQuotes) {
      rows.push({
        symbol: quote.symbol,
        price_date: quote.tradingDay,
        open_price: quote.open || null,
        high_price: quote.high || null,
        low_price: quote.low || null,
        close_price: quote.price,
        adjusted_close: quote.price,
        volume: quote.volume || null,
        source: "finnhub",
      });
    }

    const { error } = await adminClient
      .from("market_prices")
      .upsert(rows, {
        onConflict: "symbol,price_date",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error("Failed to upsert market_prices:", error.message);
    }
  }

  // 6. Update holdings with fresh + cached prices
  const allPrices = new Map(cachedPrices);
  for (const [symbol, quote] of freshQuotes) {
    allPrices.set(symbol, quote.price);
  }

  await updateHoldingsWithPrices(userSupabase, userId, holdings, allPrices, today);

  return result;
}

/**
 * Update holdings table with market prices.
 * Recalculates market_value = quantity * current_price.
 */
async function updateHoldingsWithPrices(
  supabase: SupabaseClient,
  userId: string,
  holdings: Array<{ id: string; symbol: string | null; quantity: number }>,
  prices: Map<string, number>,
  today: string
): Promise<void> {
  const BATCH_SIZE = 10;
  const updates: { id: string; data: Record<string, unknown> }[] = [];

  for (const h of holdings) {
    if (!h.symbol) continue;
    const price = prices.get(h.symbol.toUpperCase());
    if (price == null) continue;

    updates.push({
      id: h.id,
      data: {
        current_price: price,
        market_value: Number(h.quantity) * price,
        valuation_date: today,
        valuation_source: "market",
      },
    });
  }

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(({ id, data }) =>
        supabase.from("holdings").update(data).eq("id", id)
      )
    );
  }
}
