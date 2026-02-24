"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  X,
  RefreshCw,
  BarChart3,
  LineChart as LineChartIcon,
  ScatterChart as ScatterIcon,
  PieChart as PieChartIcon,
  Grid3X3,
  Radar,
  TreePine,
  Layers,
  ChevronRight,
  AlertCircle,
  Network,
} from "lucide-react";
import { AIProviderToggle } from "./ai-provider-toggle";
import type { ViewSuggestion } from "@/lib/portfolio/ai-views-types";

const PANEL_STORAGE_KEY = "portsie:ai-panel-open";
const PROVIDER_STORAGE_KEY = "portsie:ai-provider";

// ─── Chart type → icon mapping ──────────────────────────────────────────────

function ChartIcon({ type, className }: { type: string; className?: string }) {
  const cls = className ?? "size-4";
  switch (type) {
    case "bar":
      return <BarChart3 className={cls} />;
    case "line":
      return <LineChartIcon className={cls} />;
    case "scatter":
      return <ScatterIcon className={cls} />;
    case "pie":
      return <PieChartIcon className={cls} />;
    case "heatmap":
      return <Grid3X3 className={cls} />;
    case "radar":
      return <Radar className={cls} />;
    case "treemap":
      return <TreePine className={cls} />;
    case "composed":
      return <Layers className={cls} />;
    default:
      return <BarChart3 className={cls} />;
  }
}

// ─── Panel Component ────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenView: (suggestion: ViewSuggestion) => void;
  hasPortfolioData: boolean;
}

export function AISuggestionsPanel({
  isOpen,
  onClose,
  onOpenView,
  hasPortfolioData,
}: Props) {
  const [provider, setProvider] = useState<"gemini" | "sonnet">("gemini");
  const [suggestions, setSuggestions] = useState<ViewSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [providerErrors, setProviderErrors] = useState<Record<string, string>>({});

  // Restore provider preference
  useEffect(() => {
    const saved = localStorage.getItem(PROVIDER_STORAGE_KEY) as "gemini" | "sonnet" | null;
    if (saved === "gemini" || saved === "sonnet") setProvider(saved);
  }, []);

  // Fetch existing suggestions when panel opens
  useEffect(() => {
    if (isOpen && hasPortfolioData && suggestions.length === 0 && !loading && !generating) {
      fetchSuggestions();
    }
  }, [isOpen, hasPortfolioData]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/portfolio/ai-views");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch {
      // No cached suggestions — that's fine, user can generate
    } finally {
      setLoading(false);
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/portfolio/ai-views/generate", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
      setProviderErrors(data.providerErrors ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, []);

  const handleRegenerate = useCallback(async () => {
    // Delete existing, then generate fresh
    await fetch("/api/portfolio/ai-views", { method: "DELETE" }).catch(() => {});
    setSuggestions([]);
    handleGenerate();
  }, [handleGenerate]);

  const handleProviderChange = (v: "gemini" | "sonnet") => {
    setProvider(v);
    localStorage.setItem(PROVIDER_STORAGE_KEY, v);
  };

  // Split suggestions by type
  const builtinViews = suggestions.filter((s) => s.isBuiltin);
  const providerViews = suggestions.filter(
    (s) => !s.isBuiltin && s.provider === provider
  );
  const hasAnySuggestions = suggestions.length > 0;

  return (
    <div className="h-full w-full rounded-lg border bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-amber-500" />
          <span className="text-sm font-semibold text-gray-900">AI Views</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Content */}
      <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
        <div className="space-y-4 p-4">
          {/* No portfolio data */}
          {!hasPortfolioData && (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-4 text-center">
              <p className="text-sm text-gray-500">
                Add portfolio data to get AI-suggested views
              </p>
            </div>
          )}

          {/* Generate / Regenerate button */}
          {hasPortfolioData && (
            <button
              onClick={hasAnySuggestions ? handleRegenerate : handleGenerate}
              disabled={generating}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Generating views...
                </>
              ) : hasAnySuggestions ? (
                <>
                  <RefreshCw className="size-4" />
                  Regenerate
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Generate AI Views
                </>
              )}
            </button>
          )}

          {/* Generating progress */}
          {generating && (
            <div className="space-y-2">
              <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2">
                <p className="text-xs text-blue-700">
                  Asking Gemini + Sonnet for suggestions, then having Opus write the code...
                </p>
                <p className="mt-1 text-xs text-blue-500">This takes about 60-90 seconds</p>
              </div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse rounded-md border p-3">
                  <div className="h-4 w-32 rounded bg-gray-200" />
                  <div className="mt-2 h-3 w-full rounded bg-gray-100" />
                  <div className="mt-1 h-3 w-2/3 rounded bg-gray-100" />
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          {/* Loading cached */}
          {loading && !generating && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse rounded-md border p-3">
                  <div className="h-4 w-24 rounded bg-gray-200" />
                  <div className="mt-2 h-3 w-full rounded bg-gray-100" />
                </div>
              ))}
            </div>
          )}

          {/* Built-in views (always shown first) */}
          {builtinViews.length > 0 && !generating && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Default Views
              </p>
              {builtinViews.map((s) => (
                <SuggestionCard key={s.id} suggestion={s} onOpen={onOpenView} />
              ))}
            </div>
          )}

          {/* Provider toggle + suggestions */}
          {hasAnySuggestions && !generating && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                  Suggested Views
                </p>
                <AIProviderToggle value={provider} onChange={handleProviderChange} />
              </div>

              {providerViews.length > 0 ? (
                <div className="space-y-2">
                  {providerViews.map((s) => (
                    <SuggestionCard key={s.id} suggestion={s} onOpen={onOpenView} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-xs text-gray-400">
                    No {provider === "gemini" ? "Gemini" : "Sonnet"} suggestions available
                  </p>
                  {providerErrors[provider] && (
                    <p className="mt-1 text-xs text-red-400 break-words">
                      {providerErrors[provider]}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Suggestion Card ────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  onOpen,
}: {
  suggestion: ViewSuggestion;
  onOpen: (s: ViewSuggestion) => void;
}) {
  const isFailed = suggestion.codeStatus === "failed";
  const isCorrelation = suggestion.builtinType === "correlation";

  return (
    <button
      onClick={() => !isFailed && onOpen(suggestion)}
      disabled={isFailed}
      className={`group w-full rounded-md border p-3 text-left transition-colors ${
        isFailed
          ? "border-red-200 bg-red-50/50 cursor-not-allowed"
          : isCorrelation
            ? "border-amber-200 bg-amber-50/30 hover:border-amber-300 hover:bg-amber-50"
            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {isCorrelation ? (
            <Network className="size-4 text-amber-600" />
          ) : (
            <ChartIcon type={suggestion.chartType} className="size-4 text-gray-400" />
          )}
          <span className="text-sm font-medium text-gray-900">{suggestion.title}</span>
        </div>
        {!isFailed && (
          <ChevronRight className="size-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500 line-clamp-2">{suggestion.description}</p>
      {suggestion.insight && (
        <p className="mt-1.5 text-xs text-gray-400 italic line-clamp-1">
          {suggestion.insight}
        </p>
      )}
      {isFailed && (
        <p className="mt-1.5 text-xs text-red-500">Code generation failed</p>
      )}
      {isCorrelation && suggestion.correlationData && (
        <div className="mt-2 flex items-center gap-2">
          <DiversityBadge score={suggestion.correlationData.diversityScore} />
        </div>
      )}
    </button>
  );
}

// ─── Diversity Score Badge ──────────────────────────────────────────────────

function DiversityBadge({ score }: { score: number }) {
  let color: string;
  let label: string;

  if (score <= 20) {
    color = "bg-red-100 text-red-700";
    label = "Low";
  } else if (score <= 40) {
    color = "bg-orange-100 text-orange-700";
    label = "Moderate";
  } else if (score <= 60) {
    color = "bg-yellow-100 text-yellow-700";
    label = "Average";
  } else if (score <= 80) {
    color = "bg-green-100 text-green-700";
    label = "Good";
  } else {
    color = "bg-emerald-100 text-emerald-700";
    label = "Excellent";
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      Diversity: {score}/100 ({label})
    </span>
  );
}

// ─── Toggle Button (exported for use in portfolio-view) ─────────────────────

export function AIPanelToggleButton({
  isOpen,
  onClick,
}: {
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        isOpen
          ? "border-amber-300 bg-amber-50 text-amber-700"
          : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700"
      }`}
      title="AI-Suggested Views"
    >
      <Sparkles className="size-3.5" />
      <span className="hidden sm:inline">AI Views</span>
    </button>
  );
}
