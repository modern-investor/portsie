"use client";

import { useMemo } from "react";
import { Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import type { PortfolioData } from "@/app/api/portfolio/positions/route";

interface Props {
  portfolioData: PortfolioData;
}

export function DataFreshnessBanner({ portfolioData }: Props) {
  const info = useMemo(() => {
    const allAccounts = [...portfolioData.accounts, ...portfolioData.aggregateAccounts];

    // Compute latest price date
    const priceDates = portfolioData.positions
      .map((p) => p.priceDate)
      .filter(Boolean) as string[];
    const latestPriceDate = priceDates.length > 0
      ? priceDates.sort().pop()!
      : null;

    // Source breakdown
    const sources = new Map<string, number>();
    for (const acc of allAccounts) {
      const label = sourceLabel(acc.source);
      sources.set(label, (sources.get(label) ?? 0) + 1);
    }

    // Stale accounts (last synced > 7 days ago)
    const now = Date.now();
    const staleAccounts = allAccounts.filter((acc) => {
      if (!acc.lastSyncedAt) return true;
      const syncAge = now - new Date(acc.lastSyncedAt).getTime();
      return syncAge > 7 * 24 * 60 * 60 * 1000;
    });

    // Uploaded accounts last sync
    const uploadedAccounts = allAccounts.filter(
      (a) => a.source === "manual_upload" || a.source === "manual_entry" || a.source === "offline"
    );
    const latestUploadSync = uploadedAccounts
      .map((a) => a.lastSyncedAt)
      .filter(Boolean)
      .sort()
      .pop() ?? null;

    return {
      latestPriceDate,
      sources,
      staleCount: staleAccounts.length,
      totalAccounts: allAccounts.length,
      hasSchwab: portfolioData.hasSchwab,
      uploadedCount: uploadedAccounts.length,
      latestUploadSync,
    };
  }, [portfolioData]);

  const priceLabel = info.latestPriceDate
    ? formatDateShort(info.latestPriceDate)
    : "Unknown";

  const isStale = info.staleCount > 0;

  const sourceEntries = Array.from(info.sources.entries());

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-1.5 text-xs ${
        isStale
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-gray-200 bg-gray-50 text-gray-500"
      }`}
    >
      <span className="inline-flex items-center gap-1">
        <Clock className="size-3" />
        Prices as of {priceLabel}
      </span>

      <span className="text-gray-300">|</span>

      {sourceEntries.map(([source, count], i) => (
        <span key={source} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-gray-300">&middot;</span>}
          {source}: {count}
        </span>
      ))}

      {info.uploadedCount > 0 && info.latestUploadSync && (
        <>
          <span className="text-gray-300">|</span>
          <span>Last upload: {formatDateShort(info.latestUploadSync)}</span>
        </>
      )}

      {isStale ? (
        <span className="ml-auto inline-flex items-center gap-1 font-medium text-amber-600">
          <AlertTriangle className="size-3" />
          {info.staleCount} stale
        </span>
      ) : (
        <span className="ml-auto inline-flex items-center gap-1 text-green-600">
          <CheckCircle2 className="size-3" />
          All fresh
        </span>
      )}
    </div>
  );
}

function sourceLabel(source: string): string {
  switch (source) {
    case "schwab_api": return "Schwab";
    case "manual_upload": return "Uploaded";
    case "manual_entry": return "Manual";
    case "quiltt": return "Quiltt";
    case "offline": return "Offline";
    default: return source;
  }
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
