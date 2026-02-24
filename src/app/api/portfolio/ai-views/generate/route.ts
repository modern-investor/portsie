import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyPortfolio } from "@/lib/portfolio";
import type { PortfolioData } from "@/app/api/portfolio/positions/route";
import type { AIViewSuggestionRow, RawSuggestion, ViewSuggestion } from "@/lib/portfolio/ai-views-types";
import { rowToSuggestion } from "@/lib/portfolio/ai-views-types";
import { serializePortfolioForLLM, computePortfolioHash } from "@/lib/portfolio/serialize";
import {
  callGeminiForSuggestions,
  callSonnetForSuggestions,
  generateComponentCode,
  callGeminiForCorrelation,
} from "@/lib/llm/ai-views";

/**
 * POST /api/portfolio/ai-views/generate
 *
 * Full pipeline:
 * 1. Fetch portfolio data from the positions API
 * 2. Serialize + hash for cache check
 * 3. Call Gemini + Sonnet + Gemini-correlation in parallel (~15s)
 * 4. Call Opus for all 7 views in batches of 3 (~60-90s)
 * 5. Store in ai_view_suggestions table
 * 6. Return suggestions
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
    // ── Step 1: Fetch portfolio data ──
    // Call our own positions API internally via the same Supabase session
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const posRes = await fetch(`${origin}/api/portfolio/positions`, {
      headers: {
        cookie: "", // Server-side: session handled by supabase client
      },
    });

    // Alternatively, since we're server-side, re-use the supabase client to fetch directly
    // But the positions route has complex logic, so let's call the internal function approach.
    // For now, we'll inline a simplified fetch using the admin client.
    const portfolioData = await fetchPortfolioDataDirect(supabase, user.id);

    if (!portfolioData || portfolioData.positions.length === 0 && portfolioData.accounts.length === 0) {
      return NextResponse.json({ error: "No portfolio data available" }, { status: 400 });
    }

    const classified = classifyPortfolio(portfolioData.positions, portfolioData.accounts);
    const summary = serializePortfolioForLLM(portfolioData, classified);
    const portfolioHash = await computePortfolioHash(summary);

    // ── Step 2: Cache check ──
    const { data: existing } = await supabase
      .from("ai_view_suggestions")
      .select("portfolio_hash")
      .eq("user_id", user.id)
      .limit(1) as { data: { portfolio_hash: string }[] | null };

    if (existing && existing.length > 0 && existing[0].portfolio_hash === portfolioHash) {
      // Cached — return existing suggestions
      const { data: cachedRows } = await supabase
        .from("ai_view_suggestions")
        .select("*")
        .eq("user_id", user.id)
        .order("is_builtin", { ascending: false })
        .order("suggestion_provider")
        .order("suggestion_order") as { data: AIViewSuggestionRow[] | null };

      return NextResponse.json({
        suggestions: (cachedRows ?? []).map(rowToSuggestion),
        cached: true,
      });
    }

    // ── Step 3: Clear old suggestions ──
    await supabase
      .from("ai_view_suggestions")
      .delete()
      .eq("user_id", user.id);

    // ── Step 4: Call Gemini + Sonnet + Gemini-correlation in parallel ──
    console.log("[ai-views] Starting suggestion generation for user:", user.id);

    const [geminiResult, sonnetResult, correlationResult] = await Promise.allSettled([
      callGeminiForSuggestions(summary),
      callSonnetForSuggestions(summary),
      callGeminiForCorrelation(summary),
    ]);

    const geminiSuggestions = geminiResult.status === "fulfilled" ? geminiResult.value : [];
    const sonnetSuggestions = sonnetResult.status === "fulfilled" ? sonnetResult.value : [];
    const correlationData = correlationResult.status === "fulfilled" ? correlationResult.value : null;

    if (geminiResult.status === "rejected") {
      console.error("[ai-views] Gemini suggestions failed:", geminiResult.reason);
    }
    if (sonnetResult.status === "rejected") {
      console.error("[ai-views] Sonnet suggestions failed:", sonnetResult.reason);
    }
    if (correlationResult.status === "rejected") {
      console.error("[ai-views] Correlation analysis failed:", correlationResult.reason);
    }

    // ── Step 5: Generate code for all views via Opus (batched 3 at a time) ──
    interface CodeGenTask {
      provider: "gemini" | "sonnet";
      suggestion: RawSuggestion;
      order: number;
      isBuiltin: boolean;
      builtinType: string | null;
      correlationDataStr?: string;
    }

    const tasks: CodeGenTask[] = [];

    // Add regular suggestions
    for (let i = 0; i < geminiSuggestions.length; i++) {
      tasks.push({
        provider: "gemini",
        suggestion: geminiSuggestions[i],
        order: i,
        isBuiltin: false,
        builtinType: null,
      });
    }
    for (let i = 0; i < sonnetSuggestions.length; i++) {
      tasks.push({
        provider: "sonnet",
        suggestion: sonnetSuggestions[i],
        order: i,
        isBuiltin: false,
        builtinType: null,
      });
    }

    // Add correlation view
    if (correlationData) {
      tasks.push({
        provider: "gemini",
        suggestion: {
          title: "Asset Correlation",
          description: `Cross-asset correlation heatmap with diversity score: ${correlationData.diversityScore}/100`,
          chart_type: "heatmap",
          insight: correlationData.analysisSummary,
          data_spec: "Render a correlation matrix heatmap for the top positions. Show the diversity score prominently. Include risk clusters and notable pairs below the heatmap.",
        },
        order: 99,
        isBuiltin: true,
        builtinType: "correlation",
        correlationDataStr: JSON.stringify(correlationData),
      });
    }

    console.log(`[ai-views] Generating code for ${tasks.length} views via Opus...`);

    // Batch Opus calls 3 at a time to respect CLI wrapper concurrency
    const BATCH_SIZE = 3;
    const results: Array<{ task: CodeGenTask; code: string | null; error: string | null }> = [];

    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
      const batch = tasks.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map((t) =>
          generateComponentCode(
            {
              title: t.suggestion.title,
              description: t.suggestion.description,
              chartType: t.suggestion.chart_type,
              dataSpec: t.suggestion.data_spec,
              insight: t.suggestion.insight,
            },
            summary,
            t.correlationDataStr
          )
        )
      );

      for (let j = 0; j < batch.length; j++) {
        const r = batchResults[j];
        results.push({
          task: batch[j],
          code: r.status === "fulfilled" ? r.value : null,
          error: r.status === "rejected" ? String(r.reason) : null,
        });
      }
    }

    // ── Step 6: Store in DB ──
    const rows = results.map((r) => ({
      user_id: user.id,
      suggestion_provider: r.task.provider,
      title: r.task.suggestion.title,
      description: r.task.suggestion.description,
      chart_type: r.task.suggestion.chart_type,
      insight: r.task.suggestion.insight,
      data_spec: r.task.suggestion.data_spec,
      component_code: r.code,
      code_generation_status: r.code ? "complete" : "failed",
      code_generation_error: r.error,
      suggestion_order: r.task.order,
      is_builtin: r.task.isBuiltin,
      builtin_type: r.task.builtinType,
      correlation_data: r.task.builtinType === "correlation" ? correlationData : null,
      portfolio_hash: portfolioHash,
    }));

    const { data: insertedRows, error: insertError } = await supabase
      .from("ai_view_suggestions")
      .insert(rows)
      .select("*") as { data: AIViewSuggestionRow[] | null; error: unknown };

    if (insertError) {
      console.error("[ai-views] DB insert error:", insertError);
      return NextResponse.json({ error: "Failed to store suggestions" }, { status: 500 });
    }

    const suggestions = (insertedRows ?? []).map(rowToSuggestion);
    console.log(`[ai-views] Generated ${suggestions.length} views for user ${user.id}`);

    return NextResponse.json({ suggestions, cached: false });
  } catch (err) {
    console.error("[ai-views generate] Pipeline error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// ─── Internal: Fetch portfolio data directly via Supabase ───────────────────

/**
 * Simplified portfolio data fetcher that queries directly from DB.
 * This avoids calling our own API endpoint (which requires auth cookies).
 * Uses the authenticated supabase client.
 */
async function fetchPortfolioDataDirect(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<PortfolioData> {
  const positions: PortfolioData["positions"] = [];
  const accounts: PortfolioData["accounts"] = [];

  // Fetch accounts
  const { data: dbAccounts } = await supabase
    .from("accounts")
    .select(
      "id, account_nickname, institution_name, account_type, data_source, " +
      "total_market_value, cash_balance, holdings_count, last_synced_at, " +
      "account_category, account_group, is_aggregate"
    )
    .eq("user_id", userId)
    .eq("is_aggregate", false) as { data: Array<{
      id: string;
      account_nickname: string | null;
      institution_name: string | null;
      account_type: string | null;
      data_source: string;
      total_market_value: number | null;
      cash_balance: number | null;
      holdings_count: number | null;
      last_synced_at: string | null;
      account_category: string;
      account_group: string | null;
      is_aggregate: boolean;
    }> | null };

  if (dbAccounts) {
    for (const acct of dbAccounts) {
      const liqVal = Number(acct.total_market_value);
      accounts.push({
        id: acct.id,
        name: acct.account_nickname ?? acct.institution_name ?? "Account",
        institution: acct.institution_name ?? "Unknown",
        type: acct.account_type ?? "Unknown",
        source: acct.data_source as "schwab_api" | "manual_upload" | "manual_entry" | "quiltt" | "offline",
        cashBalance: Number(acct.cash_balance) || 0,
        liquidationValue: isNaN(liqVal) ? 0 : liqVal,
        holdingsCount: acct.holdings_count ?? 0,
        lastSyncedAt: acct.last_synced_at ?? null,
        accountGroup: acct.account_group ?? null,
        isAggregate: false,
        accountCategory: acct.account_category ?? "brokerage",
      });
    }
  }

  // Fetch holdings
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length > 0) {
    const { data: holdings } = await supabase
      .from("holdings")
      .select("*")
      .in("account_id", accountIds)
      .gt("quantity", 0);

    if (holdings) {
      for (const h of holdings) {
        const acct = accounts.find((a) => a.id === h.account_id);
        positions.push({
          symbol: h.symbol ?? h.name ?? "UNKNOWN",
          description: h.description ?? "",
          assetType: h.asset_type ?? "EQUITY",
          assetSubtype: h.asset_subtype ?? null,
          quantity: safeNum(h.quantity),
          shortQuantity: safeNum(h.short_quantity),
          averagePrice: safeNum(h.purchase_price),
          marketValue: safeNum(h.market_value),
          currentDayProfitLoss: safeNum(h.day_profit_loss),
          currentDayProfitLossPercentage: safeNum(h.day_profit_loss_pct),
          source: (acct?.source ?? "manual_upload") as "schwab_api" | "manual_upload" | "manual_entry" | "quiltt" | "offline",
          accountId: h.account_id,
          accountName: acct?.name ?? "",
          accountInstitution: acct?.institution ?? "",
          accountNumber: "",
          priceDate: h.valuation_date ?? null,
        });
      }
    }
  }

  return {
    positions,
    accounts,
    aggregatePositions: [],
    aggregateAccounts: [],
    hasSchwab: accounts.some((a) => a.source === "schwab_api"),
    hasUploads: accounts.some((a) => a.source !== "schwab_api"),
  };
}

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
