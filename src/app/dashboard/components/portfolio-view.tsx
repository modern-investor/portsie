"use client";

import { useEffect, useState, useMemo } from "react";
import { classifyPortfolio } from "@/lib/portfolio";
import type { ClassifiedPortfolio, AssetClassId } from "@/lib/portfolio/types";
import type { PortfolioData } from "@/app/api/portfolio/positions/route";
import { Upload, Link2, PieChart, Landmark, List } from "lucide-react";
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

// ─── Sub-tab types ──────────────────────────────────────────────────────────

type PortfolioSubTab = "assets" | "accounts" | "positions";

const STORAGE_KEY = "portsie:portfolio-tab";
const VALID_TABS: PortfolioSubTab[] = ["assets", "accounts", "positions"];

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

  // Restore saved tab from localStorage after hydration to avoid React #418
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as PortfolioSubTab | null;
    if (saved && VALID_TABS.includes(saved)) setSubTab(saved);
  }, []);
  const [selectedClass, setSelectedClass] = useState<AssetClassId | null>(null);
  const [portfolio, setPortfolio] = useState<ClassifiedPortfolio | null>(null);
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isEmpty, setIsEmpty] = useState(false);

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

  // Compute the "as of" price date from positions
  const priceDate = useMemo(() => {
    if (!portfolioData) return null;
    const dates = portfolioData.positions
      .map((p) => p.priceDate)
      .filter(Boolean) as string[];
    if (dates.length === 0) return new Date().toISOString().slice(0, 10);
    // Use the most common date, or the latest
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
    <div className="space-y-4">
      {/* Integrity warning (if discrepancies exist) */}
      {portfolioData.discrepancies && portfolioData.discrepancies.length > 0 && (
        <IntegrityWarning discrepancies={portfolioData.discrepancies} hideValues={hideValues} />
      )}

      {/* Executive summary */}
      <PortfolioSummaryBar portfolio={portfolio} hideValues={hideValues} priceDate={priceDate} />

      {/* Sub-tabs */}
      <Tabs
        value={subTab}
        onValueChange={(v) => {
          const tab = v as PortfolioSubTab;
          setSubTab(tab);
          localStorage.setItem(STORAGE_KEY, tab);
        }}
      >
        <TabsList>
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
        </TabsList>

        {/* Assets tab: donut + cards + insights */}
        <TabsContent value="assets">
          <div className="space-y-6">
            <div className="rounded-lg border bg-white p-4 sm:p-6">
              <h3 className="mb-4 text-sm font-semibold text-gray-500 uppercase tracking-wider">
                Asset Allocation
              </h3>
              <PortfolioDonutChart
                assetClasses={portfolio.assetClasses}
                totalMarketValue={portfolio.totalMarketValue}
                hideValues={hideValues}
              />
            </div>

            <div className="rounded-lg border bg-white p-4 sm:p-6">
              <PortfolioTreemap
                assetClasses={portfolio.assetClasses}
                totalMarketValue={portfolio.totalMarketValue}
                hideValues={hideValues}
              />
            </div>

            <AssetClassCards
              assetClasses={portfolio.assetClasses}
              hideValues={hideValues}
              onSelectClass={(id) => setSelectedClass(id)}
            />

            <PortfolioInsightsCard portfolio={portfolio} hideValues={hideValues} />
          </div>
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
      </Tabs>
    </div>
  );
}
