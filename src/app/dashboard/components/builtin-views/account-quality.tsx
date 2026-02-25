"use client";

import { useMemo } from "react";
import { CheckCircle2, AlertTriangle, Clock, WifiOff } from "lucide-react";
import type { PortfolioData } from "@/app/api/portfolio/positions/route";

interface Props {
  portfolioData: PortfolioData;
  hideValues: boolean;
}

type FreshnessLevel = "live" | "fresh" | "stale" | "old";

function getFreshnessLevel(lastSyncedAt: string | null): FreshnessLevel {
  if (!lastSyncedAt) return "old";
  const syncDate = new Date(lastSyncedAt);
  const now = new Date();
  const diffDays = (now.getTime() - syncDate.getTime()) / (1000 * 60 * 60 * 24);

  if (diffDays < 1) return "live";
  if (diffDays < 3) return "fresh";
  if (diffDays < 7) return "stale";
  return "old";
}

function FreshnessBadge({ level }: { level: FreshnessLevel }) {
  switch (level) {
    case "live":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          <CheckCircle2 className="size-3" />
          Live
        </span>
      );
    case "fresh":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
          <Clock className="size-3" />
          Fresh
        </span>
      );
    case "stale":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
          <AlertTriangle className="size-3" />
          Stale
        </span>
      );
    case "old":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          <WifiOff className="size-3" />
          Old
        </span>
      );
  }
}

function sourceLabel(source: string): string {
  switch (source) {
    case "schwab_api": return "Schwab API";
    case "manual_upload": return "Uploaded";
    case "manual_entry": return "Manual";
    case "quiltt": return "Quiltt";
    case "offline": return "Offline";
    default: return source;
  }
}

export function AccountQuality({ portfolioData, hideValues }: Props) {
  const accounts = useMemo(() => {
    // Combine regular and aggregate accounts, skip aggregates that duplicate
    const all = [
      ...portfolioData.accounts.filter((a) => !a.isAggregate),
      ...portfolioData.aggregateAccounts,
    ];

    return all.map((account) => {
      const freshness = getFreshnessLevel(account.lastSyncedAt);
      return {
        id: account.id,
        name: account.name || "Unnamed Account",
        institution: account.institution || "Unknown",
        source: account.source,
        holdingsCount: account.holdingsCount,
        freshness,
        lastSyncedAt: account.lastSyncedAt,
        liquidationValue: account.liquidationValue,
        isAggregate: account.isAggregate,
      };
    });
  }, [portfolioData]);

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-500">No accounts found</p>
      </div>
    );
  }

  const staleCount = accounts.filter((a) => a.freshness === "stale" || a.freshness === "old").length;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Account Quality</h3>
        <p className="text-sm text-gray-500">
          Data source, freshness, and holdings per account
        </p>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Account
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Source
              </th>
              <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Freshness
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Holdings
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Value
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {accounts.map((account) => (
              <tr key={account.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5">
                  <div>
                    <span className="font-medium text-gray-900">{account.name}</span>
                    <p className="text-xs text-gray-400">{account.institution}</p>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-xs text-gray-600">{sourceLabel(account.source)}</span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  <FreshnessBadge level={account.freshness} />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                  {account.holdingsCount}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                  {hideValues
                    ? "***"
                    : `$${account.liquidationValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {staleCount > 0 && (
        <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-700">
            {staleCount} account{staleCount > 1 ? "s have" : " has"} data older than 3 days.
            Consider refreshing prices or re-uploading statements.
          </p>
        </div>
      )}
    </div>
  );
}
