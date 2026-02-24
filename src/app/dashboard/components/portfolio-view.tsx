"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { classifyPortfolio } from "@/lib/portfolio";
import type { ClassifiedPortfolio, AssetClassId } from "@/lib/portfolio/types";
import type { PortfolioData } from "@/app/api/portfolio/positions/route";
import type { ViewSuggestion } from "@/lib/portfolio/ai-views-types";
import { Upload, Link2, PieChart, Landmark, List, X, Sparkles, Trash2, RefreshCw, PanelRight } from "lucide-react";
import type { PriceRefreshResult } from "@/lib/market";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PortfolioSummaryBar } from "./portfolio-summary-bar";
import { PortfolioDonutChart } from "./portfolio-donut-chart";
import { PortfolioTreemap } from "./portfolio-treemap";
import { AssetClassCards } from "./asset-class-cards";
import { PortfolioInsightsCard } from "./portfolio-insights-card";
import { AssetClassDetail } from "./asset-class-detail";
import { PositionsTable } from "./positions-table";
import { AccountOverview } from "./account-overview";
import { IntegrityWarning } from "./integrity-warning";
import { DynamicViewWrapper } from "./dynamic-view-wrapper";
import { AISuggestionsPanel } from "./ai-suggestions-panel";

// ─── Sub-tab types ──────────────────────────────────────────────────────────

type PortfolioSubTab = "assets" | "accounts" | "positions" | `ai-view-${string}`;
type AssetsSubTab = "allocation" | "treemap" | "cards" | "insights";

const STORAGE_KEY = "portsie:portfolio-tab";
const PANEL_STORAGE_KEY = "portsie:ai-panel-open";
const AI_TABS_STORAGE_KEY = "portsie:ai-view-tabs";
const VALID_STATIC_TABS = ["assets", "accounts", "positions"];

// ─── AI View Tab ────────────────────────────────────────────────────────────

interface AIViewTab {
  id: string;
  title: string;
  code: string;
  correlationData?: ViewSuggestion["correlationData"];
}

// ─── Empty state ────────────────────────────────────────────────────────────

function PortfolioEmptyState({
  onGoToUploads,
  onGoToConnections,
}: {
  onGoToUploads?: () => void;
  onGoToConnections?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50/50 px-6 py-16 text-center">
      <div className="mb-6 rounded-full bg-gray-100 p-4">
        <Upload className="h-8 w-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900">
        No portfolio data yet
      </h3>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        Get started by uploading your statements and reports, or connecting a brokerage API.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={onGoToUploads}
          className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
        >
          <Upload className="h-4 w-4" />
          Upload Statements &amp; Reports
        </button>
        <button
          onClick={onGoToConnections}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Link2 className="h-4 w-4" />
          Connect API
        </button>
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  hideValues: boolean;
  /** Callback to switch to a different top-level dashboard tab (e.g. "uploads"). */
  onNavigateTab?: (tab: string) => void;
}

export function PortfolioView({ hideValues, onNavigateTab }: Props) {
  const [subTab, setSubTab] = useState<PortfolioSubTab>("assets");
  const [assetsSubTab, setAssetsSubTab] = useState<AssetsSubTab>("allocation");

  // Restore saved tab from localStorage after hydration to avoid React #418
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && VALID_STATIC_TABS.includes(saved)) {
      setSubTab(saved as PortfolioSubTab);
    }
  }, []);

  const [selectedClass, setSelectedClass] = useState<AssetClassId | null>(null);
  const [portfolio, setPortfolio] = useState<ClassifiedPortfolio | null>(null);
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isEmpty, setIsEmpty] = useState(false);

  // ── Price refresh state ──
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  // ── AI Views state ──
  const [aiViewTabs, setAiViewTabs] = useState<AIViewTab[]>([]);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // Restore AI panel visibility and persisted view tabs
  useEffect(() => {
    const savedPanel = localStorage.getItem(PANEL_STORAGE_KEY);
    if (savedPanel === "true") setShowAiPanel(true);

    try {
      const savedTabs = localStorage.getItem(AI_TABS_STORAGE_KEY);
      if (savedTabs) {
        const parsed: AIViewTab[] = JSON.parse(savedTabs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAiViewTabs(parsed);
        }
      }
    } catch {
      // Invalid JSON — ignore
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/portfolio/positions");
        if (!res.ok) throw new Error("Failed to fetch portfolio data");

        const data: PortfolioData = await res.json();

        // Ensure arrays are present (guard against malformed API responses)
        if (!Array.isArray(data.positions)) data.positions = [];
        if (!Array.isArray(data.accounts)) data.accounts = [];
        if (!Array.isArray(data.aggregatePositions)) data.aggregatePositions = [];
        if (!Array.isArray(data.aggregateAccounts)) data.aggregateAccounts = [];

        // No data from any source (check both regular and aggregate)
        const hasRegularData =
          data.positions.length > 0 ||
          data.accounts.some((a) => a.cashBalance > 0 || a.liquidationValue !== 0);
        const hasAggregateData =
          (data.aggregatePositions?.length ?? 0) > 0 ||
          (data.aggregateAccounts?.length ?? 0) > 0;

        if (!hasRegularData && !hasAggregateData) {
          setIsEmpty(true);
          return;
        }

        setPortfolioData(data);
        const classified = classifyPortfolio(data.positions, data.accounts);
        setPortfolio(classified);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // ── Refresh prices handler ──
  const handleRefreshPrices = useCallback(async () => {
    setRefreshing(true);
    setRefreshMessage(null);
    try {
      const res = await fetch("/api/market/prices", { method: "POST" });
      if (!res.ok) throw new Error("Failed to refresh prices");
      const data: PriceRefreshResult = await res.json();

      const parts: string[] = [];
      if (data.updated.length > 0) parts.push(`${data.updated.length} updated`);
      if (data.cached.length > 0) parts.push(`${data.cached.length} cached`);
      if (data.failed.length > 0) parts.push(`${data.failed.length} failed`);
      if (data.skipped.length > 0) parts.push(`${data.skipped.length} skipped`);
      setRefreshMessage(parts.join(", ") || "No tradeable symbols");

      // Re-fetch portfolio data to reflect updated prices
      const posRes = await fetch("/api/portfolio/positions");
      if (posRes.ok) {
        const posData: PortfolioData = await posRes.json();
        if (!Array.isArray(posData.positions)) posData.positions = [];
        if (!Array.isArray(posData.accounts)) posData.accounts = [];
        if (!Array.isArray(posData.aggregatePositions)) posData.aggregatePositions = [];
        if (!Array.isArray(posData.aggregateAccounts)) posData.aggregateAccounts = [];
        setPortfolioData(posData);
        setPortfolio(classifyPortfolio(posData.positions, posData.accounts));
      }

      // Auto-clear message after 5s
      setTimeout(() => setRefreshMessage(null), 5000);
    } catch {
      setRefreshMessage("Refresh failed");
      setTimeout(() => setRefreshMessage(null), 5000);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Compute the "as of" price date from positions
  const priceDate = useMemo(() => {
    if (!portfolioData) return null;
    const dates = portfolioData.positions
      .map((p) => p.priceDate)
      .filter(Boolean) as string[];
    if (dates.length === 0) return new Date().toISOString().slice(0, 10);
    const counts = new Map<string, number>();
    for (const d of dates) {
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    let best = dates[0];
    let bestCount = 0;
    for (const [d, c] of counts) {
      if (c > bestCount) {
        best = d;
        bestCount = c;
      }
    }
    return best;
  }, [portfolioData]);

  // ── AI Panel handlers ──

  const toggleAiPanel = useCallback(() => {
    setShowAiPanel((prev) => {
      const next = !prev;
      localStorage.setItem(PANEL_STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  // Helper to persist tabs to localStorage
  const persistTabs = useCallback((tabs: AIViewTab[]) => {
    localStorage.setItem(AI_TABS_STORAGE_KEY, JSON.stringify(tabs));
  }, []);

  const openAiView = useCallback(
    (suggestion: ViewSuggestion) => {
      if (!suggestion.componentCode || suggestion.codeStatus !== "complete") return;

      // Check if this view is already open
      const existingTab = aiViewTabs.find((t) => t.id === suggestion.id);
      if (existingTab) {
        setSubTab(`ai-view-${suggestion.id}`);
        return;
      }

      // Add new tab and persist
      const newTab: AIViewTab = {
        id: suggestion.id,
        title: suggestion.title,
        code: suggestion.componentCode,
        correlationData: suggestion.correlationData,
      };
      const updatedTabs = [...aiViewTabs, newTab];
      setAiViewTabs(updatedTabs);
      persistTabs(updatedTabs);
      setSubTab(`ai-view-${suggestion.id}`);
    },
    [aiViewTabs, persistTabs]
  );

  const closeAiTab = useCallback(
    (tabId: string) => {
      const updatedTabs = aiViewTabs.filter((t) => t.id !== tabId);
      setAiViewTabs(updatedTabs);
      persistTabs(updatedTabs);
      // If we're closing the current tab, switch back to assets
      if (subTab === `ai-view-${tabId}`) {
        setSubTab("assets");
        localStorage.setItem(STORAGE_KEY, "assets");
      }
    },
    [subTab, aiViewTabs, persistTabs]
  );

  // ── Loading state ──
  if (loading) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-400">Loading portfolio...</p>
        <div className="rounded-lg border p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 rounded bg-gray-200" />
            <div className="h-4 w-32 rounded bg-gray-200" />
            <div className="grid grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 rounded-lg bg-gray-200" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
        {error}
      </div>
    );
  }

  // ── Empty state ──
  if (isEmpty || !portfolio || !portfolioData) {
    return (
      <PortfolioEmptyState
        onGoToUploads={() => onNavigateTab?.("connections:uploads")}
        onGoToConnections={() => onNavigateTab?.("connections:datalinks")}
      />
    );
  }

  // ── Drill-down into specific asset class ──
  if (selectedClass) {
    return (
      <div className="space-y-4">
        {portfolioData.discrepancies && portfolioData.discrepancies.length > 0 && (
          <IntegrityWarning discrepancies={portfolioData.discrepancies} hideValues={hideValues} />
        )}
        <PortfolioSummaryBar portfolio={portfolio} hideValues={hideValues} priceDate={priceDate} />
        <AssetClassDetail
          classId={selectedClass}
          portfolio={portfolio}
          hideValues={hideValues}
          onBack={() => setSelectedClass(null)}
        />
      </div>
    );
  }

  return (
    <div className="relative space-y-4">
      {/* Integrity warning (if discrepancies exist) */}
      {portfolioData.discrepancies && portfolioData.discrepancies.length > 0 && (
        <IntegrityWarning discrepancies={portfolioData.discrepancies} hideValues={hideValues} />
      )}

      {/* Executive summary */}
      <PortfolioSummaryBar portfolio={portfolio} hideValues={hideValues} priceDate={priceDate} />

      {/* Main content + AI panel side-by-side */}
      <div className="flex gap-4">
        {/* Main content area */}
        <div className="min-w-0 flex-1">
          <Tabs
            value={subTab}
            onValueChange={(v) => {
              const tab = v as PortfolioSubTab;
              setSubTab(tab);
              // Only persist static tabs to localStorage
              if (VALID_STATIC_TABS.includes(v)) {
                localStorage.setItem(STORAGE_KEY, v);
              }
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <TabsList className="flex-1 overflow-x-auto">
                <TabsTrigger value="assets">
                  <PieChart className="size-5" />
                  Assets
                </TabsTrigger>
                <TabsTrigger value="accounts">
                  <Landmark className="size-5" />
                  Accounts
                </TabsTrigger>
                <TabsTrigger value="positions">
                  <List className="size-5" />
                  Positions
                </TabsTrigger>

                {/* Dynamic AI view tabs */}
                {aiViewTabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={`ai-view-${tab.id}`}
                    className="group relative pr-7"
                  >
                    <Sparkles className="size-4 text-amber-500" />
                    <span className="max-w-24 truncate">{tab.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeAiTab(tab.id);
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-gray-200 hover:text-gray-600 transition-all"
                    >
                      <X className="size-3" />
                    </button>
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Refresh prices + AI panel toggle */}
              <div className="flex items-center gap-1.5">
                {refreshMessage && (
                  <span className="text-xs text-gray-500 hidden sm:inline">
                    {refreshMessage}
                  </span>
                )}
                <button
                  onClick={handleRefreshPrices}
                  disabled={refreshing}
                  title="Refresh market prices"
                  className="inline-flex items-center justify-center rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={toggleAiPanel}
                  title={showAiPanel ? "Hide AI panel" : "Show AI panel"}
                  className={`hidden md:inline-flex items-center justify-center rounded-md p-2 transition-colors ${
                    showAiPanel
                      ? "text-amber-600 bg-amber-50 hover:bg-amber-100"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  }`}
                >
                  <PanelRight className="size-4" />
                </button>
              </div>
            </div>

            {/* Assets tab with subtabs */}
            <TabsContent value="assets">
              {/* Subtab navigation */}
              <div className="mb-4 flex gap-1 border-b border-gray-200">
                {([
                  { id: "allocation", label: "Allocation" },
                  { id: "treemap", label: "Treemap" },
                  { id: "cards", label: "Cards" },
                  { id: "insights", label: "Insights" },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setAssetsSubTab(tab.id)}
                    className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      assetsSubTab === tab.id
                        ? "border-black text-black"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Subtab content */}
              {assetsSubTab === "allocation" && (
                <div className="rounded-lg border bg-white p-4 sm:p-6">
                  <PortfolioDonutChart
                    assetClasses={portfolio.assetClasses}
                    totalMarketValue={portfolio.totalMarketValue}
                    hideValues={hideValues}
                  />
                </div>
              )}

              {assetsSubTab === "treemap" && (
                <div className="rounded-lg border bg-white p-4 sm:p-6">
                  <PortfolioTreemap
                    assetClasses={portfolio.assetClasses}
                    totalMarketValue={portfolio.totalMarketValue}
                    hideValues={hideValues}
                  />
                </div>
              )}

              {assetsSubTab === "cards" && (
                <AssetClassCards
                  assetClasses={portfolio.assetClasses}
                  hideValues={hideValues}
                  onSelectClass={(id) => setSelectedClass(id)}
                />
              )}

              {assetsSubTab === "insights" && (
                <PortfolioInsightsCard portfolio={portfolio} hideValues={hideValues} />
              )}
            </TabsContent>

            {/* Accounts tab — pass fetched data as props */}
            <TabsContent value="accounts">
              <AccountOverview
                accounts={portfolioData.accounts}
                aggregateAccounts={portfolioData.aggregateAccounts}
                hideValues={hideValues}
              />
            </TabsContent>

            {/* Positions tab — pass fetched data as props */}
            <TabsContent value="positions">
              <PositionsTable
                positions={portfolioData.positions}
                accounts={portfolioData.accounts}
                hideValues={hideValues}
              />
            </TabsContent>

            {/* Dynamic AI view tab contents */}
            {aiViewTabs.map((tab) => (
              <TabsContent key={tab.id} value={`ai-view-${tab.id}`}>
                <div className="space-y-3">
                  {/* View header with delete button */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-amber-500" />
                      <span className="text-sm font-medium text-gray-700">{tab.title}</span>
                    </div>
                    <button
                      onClick={() => closeAiTab(tab.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors"
                    >
                      <Trash2 className="size-3" />
                      Delete View
                    </button>
                  </div>
                  <DynamicViewWrapper
                    code={tab.code}
                    portfolioData={portfolioData}
                    classifiedPortfolio={portfolio}
                    hideValues={hideValues}
                    correlationData={tab.correlationData}
                  />
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>

        {/* AI Suggestions Panel (right side, inline) */}
        {showAiPanel && (
          <div className="hidden w-80 shrink-0 md:block">
            <AISuggestionsPanel
              isOpen={showAiPanel}
              onClose={() => {
                setShowAiPanel(false);
                localStorage.setItem(PANEL_STORAGE_KEY, "false");
              }}
              onOpenView={openAiView}
              hasPortfolioData={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
