import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MarketPriceRow } from "@/lib/market/types";

/**
 * POST /api/market/finnhub/webhook
 *
 * Receives real-time trade data from Finnhub webhooks.
 * Verifies the X-Finnhub-Secret header and writes price data to market_prices.
 *
 * Finnhub webhook payload format:
 * { "type": "trade", "data": [{ "s": "AAPL", "p": 189.50, "t": 1708900000000, "v": 100 }] }
 */
export async function POST(request: Request) {
  // Verify webhook secret
  const secret = request.headers.get("x-finnhub-secret");
  const expectedSecret = process.env.FINNHUB_WEBHOOK_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Finnhub sends { type: "trade"|"ping", data: [...] }
    if (body.type === "ping") {
      return NextResponse.json({ ok: true });
    }

    if (body.type !== "trade" || !Array.isArray(body.data)) {
      return NextResponse.json({ ok: true });
    }

    const adminClient = createAdminClient();
    const rows: MarketPriceRow[] = [];

    for (const trade of body.data) {
      if (!trade.s || !trade.p || trade.p <= 0) continue;

      // Convert millisecond timestamp to YYYY-MM-DD in US Eastern
      const tradingDay = new Date(trade.t).toLocaleDateString("en-CA", {
        timeZone: "America/New_York",
      });

      rows.push({
        symbol: trade.s,
        price_date: tradingDay,
        open_price: null,
        high_price: null,
        low_price: null,
        close_price: trade.p,
        adjusted_close: trade.p,
        volume: trade.v ?? null,
        source: "finnhub_webhook",
      });
    }

    if (rows.length > 0) {
      // Deduplicate — keep latest price per symbol per day
      const unique = new Map<string, MarketPriceRow>();
      for (const row of rows) {
        unique.set(`${row.symbol}:${row.price_date}`, row);
      }

      await adminClient
        .from("market_prices")
        .upsert(Array.from(unique.values()), {
          onConflict: "symbol,price_date",
          ignoreDuplicates: false,
        });
    }

    return NextResponse.json({ ok: true, processed: rows.length });
  } catch (error) {
    console.error("Finnhub webhook error:", error);
    return NextResponse.json({ ok: true }); // Return 2xx to avoid Finnhub disabling the endpoint
  }
}
