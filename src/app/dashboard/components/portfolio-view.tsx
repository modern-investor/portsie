"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { classifyPortfolio } from "@/lib/portfolio";
import type { ClassifiedPortfolio, AssetClassId } from "@/lib/portfolio/types";
import type { SchwabPosition, SchwabAccount } from "@/lib/schwab/types";
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

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  hideValues: boolean;
}

export function PortfolioView({ hideValues }: Props) {
  const [subTab, setSubTab] = useState<PortfolioSubTab>("assets");
  const [selectedClass, setSelectedClass] = useState<AssetClassId | null>(null);
  const [portfolio, setPortfolio] = useState<ClassifiedPortfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [posRes, accRes] = await Promise.all([
          fetch("/api/schwab/positions"),
          fetch("/api/schwab/accounts"),
        ]);

        if (!posRes.ok || !accRes.ok) {
          throw new Error("Failed to fetch portfolio data");
        }

        const positions: SchwabPosition[] = await posRes.json();
        const accounts: SchwabAccount[] = await accRes.json();

        const classified = classifyPortfolio(positions, accounts);
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

  if (!portfolio) return null;

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

      {/* Accounts tab */}
      {subTab === "accounts" && <AccountOverview hideValues={hideValues} />}

      {/* Positions tab */}
      {subTab === "positions" && <PositionsTable hideValues={hideValues} />}
    </div>
  );
}
