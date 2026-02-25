import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyPortfolio } from "@/lib/portfolio";
import { assemblePortfolio } from "@/lib/portfolio/fetch-portfolio";
import type { AIViewSuggestionRow, RawSuggestion } from "@/lib/portfolio/ai-views-types";
import { rowToSuggestion } from "@/lib/portfolio/ai-views-types";
import { serializePortfolioForLLM, computePortfolioHash } from "@/lib/portfolio/serialize";
import {
  callGeminiForSuggestions,
  callSonnetForSuggestions,
  generateChartSpec,
  callGeminiForCorrelation,
} from "@/lib/llm/ai-views";
import { objectivePromptContext } from "@/app/dashboard/components/investor-objective-selector";

/**
 * POST /api/portfolio/ai-views/generate
 *
 * Full pipeline:
 * 1. Fetch portfolio data via shared assemblePortfolio() (same as dashboard)
 * 2. Serialize + hash for cache check
 * 3. Call Gemini + Sonnet + Gemini-correlation in parallel (~15s)
 * 4. Generate declarative chart specs for each suggestion (~5-10s)
 * 5. Store in ai_view_suggestions table
 * 6. Return suggestions
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse investor objective from query params
  const url = new URL(request.url);
  const objective = url.searchParams.get("objective") ?? null;

  try {
    // ── Step 1: Fetch portfolio data via shared module ──
    const portfolioData = await assemblePortfolio(supabase, user.id);

    if (!portfolioData || portfolioData.positions.length === 0 && portfolioData.accounts.length === 0) {
      return NextResponse.json({ error: "No portfolio data available" }, { status: 400 });
    }

    // ── Generation lock: prevent concurrent runs ──
    const { data: inProgress } = await supabase
      .from("ai_view_suggestions")
      .select("created_at")
      .eq("user_id", user.id)
      .eq("code_generation_status", "generating")
      .limit(1);

    if (inProgress && inProgress.length > 0) {
      const createdAt = new Date(inProgress[0].created_at).getTime();
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      if (createdAt > fiveMinAgo) {
        return NextResponse.json(
          { error: "Generation already in progress" },
          { status: 409 }
        );
      }
    }

    const classified = classifyPortfolio(portfolioData.positions, portfolioData.accounts);
    const summary = serializePortfolioForLLM(portfolioData, classified);
    // Include objective in hash so changing focus invalidates cache
    const hashInput = objective ? `${summary}\n__OBJECTIVE__:${objective}` : summary;
    const portfolioHash = await computePortfolioHash(hashInput);

    // ── Step 2: Cache check ──
    const { data: existing } = await supabase
      .from("ai_view_suggestions")
      .select("portfolio_hash")
      .eq("user_id", user.id)
      .limit(1) as { data: { portfolio_hash: string }[] | null };

    if (existing && existing.length > 0 && existing[0].portfolio_hash === portfolioHash) {
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

    // Append investor objective context to the summary for LLM prompts
    const objContext = objectivePromptContext(objective as Parameters<typeof objectivePromptContext>[0]);
    const summaryWithObjective = summary + objContext;

    const [geminiResult, sonnetResult, correlationResult] = await Promise.allSettled([
      callGeminiForSuggestions(summaryWithObjective),
      callSonnetForSuggestions(summaryWithObjective),
      callGeminiForCorrelation(summary), // Correlation doesn't need objective context
    ]);

    const geminiSuggestions = geminiResult.status === "fulfilled" ? geminiResult.value : [];
    const sonnetSuggestions = sonnetResult.status === "fulfilled" ? sonnetResult.value : [];
    const correlationData = correlationResult.status === "fulfilled" ? correlationResult.value : null;

    const providerErrors: Record<string, string> = {};
    if (geminiResult.status === "rejected") {
      const reason = geminiResult.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack?.split("\n").slice(0, 3).join(" > ") : "";
      console.error("[ai-views] Gemini suggestions failed:", { message: msg, stack });
      providerErrors.gemini = msg;
    }
    if (sonnetResult.status === "rejected") {
      const reason = sonnetResult.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      console.error("[ai-views] Sonnet suggestions failed:", msg);
      providerErrors.sonnet = msg;
    }
    if (correlationResult.status === "rejected") {
      const reason = correlationResult.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      console.error("[ai-views] Correlation analysis failed:", msg);
      providerErrors.correlation = msg;
    }

    console.log("[ai-views] Provider results:", {
      gemini: geminiResult.status === "fulfilled" ? `${geminiSuggestions.length} suggestions` : "FAILED",
      sonnet: sonnetResult.status === "fulfilled" ? `${sonnetSuggestions.length} suggestions` : "FAILED",
      correlation: correlationResult.status === "fulfilled" ? "OK" : "FAILED",
      errors: Object.keys(providerErrors),
    });

    // ── Step 5: Generate declarative chart specs for all views ──
    interface ChartSpecTask {
      provider: "gemini" | "sonnet";
      suggestion: RawSuggestion;
      order: number;
      isBuiltin: boolean;
      builtinType: string | null;
      correlationDataStr?: string;
    }

    const tasks: ChartSpecTask[] = [];

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

    console.log(`[ai-views] Generating chart specs for ${tasks.length} views...`);

    // Generate chart specs in parallel (fast — no Opus, uses Gemini)
    const BATCH_SIZE = 4;
    const results: Array<{ task: ChartSpecTask; chartSpec: string | null; error: string | null }> = [];

    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
      const batch = tasks.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map((t) =>
          generateChartSpec(
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
          chartSpec: r.status === "fulfilled" ? JSON.stringify(r.value) : null,
          error: r.status === "rejected" ? String(r.reason) : null,
        });
      }
    }

    // ── Step 6: Store in DB ──
    const errorsJson = Object.keys(providerErrors).length > 0 ? providerErrors : null;

    const rows = results.map((r) => ({
      user_id: user.id,
      suggestion_provider: r.task.provider,
      title: r.task.suggestion.title,
      description: r.task.suggestion.description,
      chart_type: r.task.suggestion.chart_type,
      insight: r.task.suggestion.insight,
      data_spec: r.task.suggestion.data_spec,
      component_code: null,
      chart_spec: r.chartSpec ? JSON.parse(r.chartSpec) : null,
      code_generation_status: r.chartSpec ? "complete" : "failed",
      code_generation_error: r.error,
      suggestion_order: r.task.order,
      is_builtin: r.task.isBuiltin,
      builtin_type: r.task.builtinType,
      correlation_data: r.task.builtinType === "correlation" ? correlationData : null,
      portfolio_hash: portfolioHash,
      generation_errors: errorsJson,
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

    return NextResponse.json({
      suggestions,
      cached: false,
      ...(Object.keys(providerErrors).length > 0 && { providerErrors }),
    });
  } catch (err) {
    console.error("[ai-views generate] Pipeline error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
