/**
 * LLM calling functions for AI-suggested portfolio views.
 *
 * - callGeminiForSuggestions: Gemini Flash 3.x → 3 view suggestions
 * - callSonnetForSuggestions: Claude Sonnet 4.6 CLI → 3 view suggestions
 * - generateChartSpec: Gemini Flash 3.x → declarative chart JSON spec
 * - callGeminiForCorrelation: Gemini Flash 3.x → correlation analysis
 */

import {
  buildSuggestionPrompt,
  buildChartSpecPrompt,
  buildCorrelationPrompt,
} from "./prompts-ai-views";
import type { RawSuggestion, CorrelationData } from "../portfolio/ai-views-types";
import type { DeclarativeChartSpec } from "../portfolio/chart-spec-types";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-3-flash-preview";

// ─── Gemini: View Suggestions ───────────────────────────────────────────────

export async function callGeminiForSuggestions(
  portfolioSummary: string
): Promise<RawSuggestion[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set (env var missing)");

  console.log("[ai-views] Calling Gemini for suggestions...", {
    model: DEFAULT_GEMINI_MODEL,
    promptLength: portfolioSummary.length,
  });

  const prompt = buildSuggestionPrompt(portfolioSummary);
  const text = await callGeminiText(apiKey, prompt, "low");

  console.log("[ai-views] Gemini suggestion response length:", text.length, "chars");
  if (text.length < 20) {
    console.warn("[ai-views] Gemini returned very short response:", text);
  }

  return parseSuggestions(text, "gemini");
}

// ─── Sonnet CLI: View Suggestions ───────────────────────────────────────────

export async function callSonnetForSuggestions(
  portfolioSummary: string
): Promise<RawSuggestion[]> {
  const prompt = buildSuggestionPrompt(portfolioSummary);
  const text = await callCLIRemote(prompt, "claude-sonnet-4-6");
  return parseSuggestions(text, "sonnet");
}

// ─── Gemini: Declarative Chart Spec Generation ──────────────────────────────

export async function generateChartSpec(
  suggestion: { title: string; description: string; chartType: string; dataSpec: string; insight: string },
  portfolioSummary: string,
  correlationData?: string
): Promise<DeclarativeChartSpec> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set (env var missing)");

  const prompt = buildChartSpecPrompt(suggestion, portfolioSummary, correlationData);
  const text = await callGeminiText(apiKey, prompt, "low");

  return parseChartSpec(text);
}

// ─── Gemini: Correlation Analysis ───────────────────────────────────────────

export async function callGeminiForCorrelation(
  portfolioSummary: string
): Promise<CorrelationData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set (env var missing)");

  console.log("[ai-views] Calling Gemini for correlation analysis...");

  const prompt = buildCorrelationPrompt(portfolioSummary);
  const text = await callGeminiText(apiKey, prompt, "medium");

  console.log("[ai-views] Gemini correlation response length:", text.length, "chars");

  return parseCorrelationData(text);
}

// ─── Internal: Gemini text-only call with SSE streaming ─────────────────────

async function callGeminiText(
  apiKey: string,
  prompt: string,
  thinkingLevel: "minimal" | "low" | "medium" | "high"
): Promise<string> {
  const requestBody = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 65536,
      thinkingConfig: { thinkingLevel },
    },
  };

  const url = `${GEMINI_API_URL}/${DEFAULT_GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(120_000), // 2 min timeout
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown");
    console.error("[ai-views] Gemini API HTTP error:", {
      status: response.status,
      statusText: response.statusText,
      body: errorText.slice(0, 500),
    });
    throw new Error(`Gemini API error (${response.status}): ${errorText.slice(0, 300)}`);
  }

  return collectSSEText(response);
}

/**
 * Collect text from a Gemini SSE stream response.
 */
async function collectSSEText(response: Response): Promise<string> {
  const body = response.body;
  if (!body) throw new Error("No response body from Gemini stream");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const chunk = JSON.parse(trimmed.slice(6));
        const candidate = chunk.candidates?.[0];
        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.thought) continue;
            if (part.text) fullText += part.text;
          }
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  return fullText;
}

// ─── Internal: CLI wrapper remote call ──────────────────────────────────────

async function callCLIRemote(prompt: string, model: string): Promise<string> {
  const endpoint = process.env.PORTSIE_CLI_ENDPOINT || "http://159.89.157.120:8910/extract";

  const body: Record<string, unknown> = { prompt, model };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const authToken = process.env.PORTSIE_CLI_AUTH_TOKEN;
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000), // 5 min timeout
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `CLI remote error (${response.status}, model=${model}): ${errorText}`
    );
  }

  const cliResponse = await response.json();
  return typeof cliResponse.result === "string"
    ? cliResponse.result
    : JSON.stringify(cliResponse.result);
}

// ─── Internal: Response parsers ─────────────────────────────────────────────

function parseSuggestions(text: string, provider: string): RawSuggestion[] {
  let json = text.trim();

  if (json.startsWith("```")) {
    const firstNewline = json.indexOf("\n");
    json = json.slice(firstNewline + 1);
  }
  if (json.endsWith("```")) {
    json = json.slice(0, json.lastIndexOf("```")).trim();
  }

  const objStart = json.indexOf("{");
  const objEnd = json.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    json = json.slice(objStart, objEnd + 1);
  }

  let parsed: { suggestions?: RawSuggestion[] };
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(
      `Failed to parse ${provider} suggestions JSON: ${err instanceof Error ? err.message : err}`
    );
  }

  if (!Array.isArray(parsed.suggestions) || parsed.suggestions.length === 0) {
    throw new Error(`No suggestions array in ${provider} response`);
  }

  return parsed.suggestions.slice(0, 3).map((s) => ({
    title: String(s.title || "Untitled View"),
    description: String(s.description || ""),
    chart_type: String(s.chart_type || "bar"),
    insight: String(s.insight || ""),
    data_spec: String(s.data_spec || ""),
  }));
}

function parseChartSpec(text: string): DeclarativeChartSpec {
  let json = text.trim();

  if (json.startsWith("```")) {
    const firstNewline = json.indexOf("\n");
    json = json.slice(firstNewline + 1);
  }
  if (json.endsWith("```")) {
    json = json.slice(0, json.lastIndexOf("```")).trim();
  }

  const objStart = json.indexOf("{");
  const objEnd = json.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    json = json.slice(objStart, objEnd + 1);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(
      `Failed to parse chart spec JSON: ${err instanceof Error ? err.message : err}`
    );
  }

  // Validate required fields
  if (!parsed.chart_type || typeof parsed.chart_type !== "string") {
    throw new Error("Chart spec missing chart_type");
  }
  if (!parsed.data_transform || typeof parsed.data_transform !== "object") {
    throw new Error("Chart spec missing data_transform");
  }

  const dt = parsed.data_transform as Record<string, unknown>;
  if (!dt.source || typeof dt.source !== "string") {
    throw new Error("Chart spec data_transform missing source");
  }

  // Validate source is a known safe value
  const validSources = ["assetClasses", "positions", "accounts", "correlationMatrix", "riskClusters", "notablePairs", "custom"];
  if (!validSources.includes(dt.source as string)) {
    throw new Error(`Chart spec has unknown data source: ${dt.source}`);
  }

  return parsed as unknown as DeclarativeChartSpec;
}

function parseCorrelationData(text: string): CorrelationData {
  let json = text.trim();

  if (json.startsWith("```")) {
    const firstNewline = json.indexOf("\n");
    json = json.slice(firstNewline + 1);
  }
  if (json.endsWith("```")) {
    json = json.slice(0, json.lastIndexOf("```")).trim();
  }

  const objStart = json.indexOf("{");
  const objEnd = json.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    json = json.slice(objStart, objEnd + 1);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(
      `Failed to parse correlation JSON: ${err instanceof Error ? err.message : err}`
    );
  }

  const symbols = parsed.symbols as string[];
  const matrix = parsed.correlation_matrix as number[][];
  const score = Number(parsed.diversity_score);

  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new Error("Missing symbols array in correlation response");
  }
  if (!Array.isArray(matrix) || matrix.length !== symbols.length) {
    throw new Error("Invalid correlation matrix dimensions");
  }
  if (isNaN(score) || score < 1 || score > 100) {
    throw new Error(`Invalid diversity score: ${parsed.diversity_score}`);
  }

  const notable = parsed.notable_pairs as {
    most_correlated?: Array<{ pair: string[]; correlation: number; reason: string }>;
    least_correlated?: Array<{ pair: string[]; correlation: number; reason: string }>;
  } | undefined;

  const clusters = parsed.risk_clusters as Array<{
    name: string;
    symbols: string[];
    internal_correlation: number;
  }> | undefined;

  return {
    symbols,
    correlationMatrix: matrix,
    diversityScore: Math.round(score),
    notablePairs: {
      mostCorrelated: (notable?.most_correlated ?? []).map((p) => ({
        pair: [String(p.pair?.[0] ?? ""), String(p.pair?.[1] ?? "")] as [string, string],
        correlation: Number(p.correlation) || 0,
        reason: String(p.reason ?? ""),
      })),
      leastCorrelated: (notable?.least_correlated ?? []).map((p) => ({
        pair: [String(p.pair?.[0] ?? ""), String(p.pair?.[1] ?? "")] as [string, string],
        correlation: Number(p.correlation) || 0,
        reason: String(p.reason ?? ""),
      })),
    },
    riskClusters: (clusters ?? []).map((c) => ({
      name: String(c.name ?? "Cluster"),
      symbols: Array.isArray(c.symbols) ? c.symbols.map(String) : [],
      internalCorrelation: Number(c.internal_correlation) || 0,
    })),
    analysisSummary: String(parsed.analysis_summary ?? ""),
  };
}
