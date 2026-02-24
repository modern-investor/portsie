import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshPrices } from "@/lib/market";

/**
 * POST /api/market/prices
 *
 * Refreshes market prices for the authenticated user's holdings.
 * Uses Finnhub (primary, 60/min) with Alpha Vantage fallback (25/day).
 * Symbols already fetched today are served from the market_prices cache.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshPrices(supabase, user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Price refresh failed:", error);
    return NextResponse.json(
      { error: "Failed to refresh prices" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/market/prices?symbols=AAPL,MSFT
 *
 * Returns cached prices from the market_prices table (no external API calls).
 * If no symbols param, returns latest prices for all user's holdings.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const symbolsParam = url.searchParams.get("symbols");

  let symbols: string[];

  if (symbolsParam) {
    symbols = symbolsParam.split(",").map((s) => s.trim().toUpperCase());
  } else {
    const { data: holdings } = await supabase
      .from("holdings")
      .select("symbol")
      .eq("user_id", user.id)
      .gt("quantity", 0)
      .not("symbol", "is", null);

    symbols = [
      ...new Set(
        (holdings ?? []).map((h: { symbol: string }) => h.symbol).filter(Boolean)
      ),
    ];
  }

  if (symbols.length === 0) {
    return NextResponse.json({ prices: [] });
  }

  const { data: prices } = await supabase
    .from("market_prices")
    .select("*")
    .in("symbol", symbols)
    .order("price_date", { ascending: false });

  // Deduplicate to latest per symbol
  const latest = new Map<string, (typeof prices extends (infer T)[] | null ? T : never)>();
  for (const p of prices ?? []) {
    if (!latest.has(p.symbol)) {
      latest.set(p.symbol, p);
    }
  }

  return NextResponse.json({ prices: Array.from(latest.values()) });
}
