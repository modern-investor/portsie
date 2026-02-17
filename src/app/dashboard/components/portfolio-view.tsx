"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { classifyPortfolio } from "@/lib/portfolio";
import type { ClassifiedPortfolio, AssetClassId } from "@/lib/portfolio/types";
import type { PortfolioData } from "@/app/api/portfolio/positions/route";
import { Upload, Link2 } from "lucide-react";
import { PortfolioSummaryBar } from "./portfolio-summary-bar";
import { PortfolioDonutChart } from "./portfolio-donut-chart";
import { AssetClassCards } from "./asset-class-cards";
import { PortfolioInsightsCard } from "./portfolio-insights-card";
import { AssetClassDetail } from "./asset-class-detail";
import { PositionsTable } from "./positions-table";
import { AccountOverview } from "./account-overview";

// ─── Sub-tab types ──────────────────────────────────────────────────────────

type PortfolioSubTab = "assets" | "accounts" | "positions";

const SUB_TABS: { id: PortfolioSubTab; label: string }[] = [
  { id: "assets", label: "Assets" },
  { id: "accounts", label: "Accounts" },
  { id: "positions", label: "Positions" },
];

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

        // No data from any source
        if (data.positions.length === 0 && data.accounts.every((a) => a.cashBalance === 0)) {
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
        onGoToConnections={() => onNavigateTab?.("connections:api")}
      />
    );
  }

  // ── Drill-down into specific asset class ──
  if (selectedClass) {
    return (
      <div className="space-y-4">
        <PortfolioSummaryBar portfolio={portfolio} hideValues={hideValues} />
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
      {/* Executive summary */}
      <PortfolioSummaryBar portfolio={portfolio} hideValues={hideValues} />

      {/* Sub-tabs */}
      <nav className="flex gap-1">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              subTab === tab.id
                ? "bg-gray-900 text-white"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Assets tab: donut + cards + insights */}
      {subTab === "assets" && (
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

          <AssetClassCards
            assetClasses={portfolio.assetClasses}
            hideValues={hideValues}
            onSelectClass={(id) => setSelectedClass(id)}
          />

          <PortfolioInsightsCard portfolio={portfolio} hideValues={hideValues} />
        </div>
      )}

      {/* Accounts tab — pass fetched data as props */}
      {subTab === "accounts" && (
        <AccountOverview accounts={portfolioData.accounts} hideValues={hideValues} />
      )}

      {/* Positions tab — pass fetched data as props */}
      {subTab === "positions" && (
        <PositionsTable positions={portfolioData.positions} hideValues={hideValues} />
      )}
    </div>
  );
}
