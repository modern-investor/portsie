"use client";

import { useMemo } from "react";
import type { UnifiedAccount } from "@/app/api/portfolio/positions/route";

interface Props {
  accounts: UnifiedAccount[];
  aggregateAccounts?: UnifiedAccount[];
  hideValues: boolean;
}

/** Preferred display order for account groups. Unlisted groups sort alphabetically after these. */
const GROUP_ORDER: string[] = [
  "Non Retirement",
  "Retirement",
  "SubTrust",
  "Other People's Money",
  "R & K Real Estate",
  "External Subhash",
  "External Bank And CC",
];

function groupSortKey(groupName: string): number {
  const idx = GROUP_ORDER.indexOf(groupName);
  return idx >= 0 ? idx : GROUP_ORDER.length; // unlisted groups go after known ones
}

export function AccountOverview({ accounts, aggregateAccounts, hideValues }: Props) {
  function formatDollar(value: number, fractionDigits = 2) {
    if (hideValues) {
      return <span className="text-gray-300 select-none">$*****</span>;
    }
    return (
      <>
        $
        {value.toLocaleString("en-US", {
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        })}
      </>
    );
  }

  // Group accounts by accountGroup
  const grouped = useMemo(() => {
    const groups = new Map<string, UnifiedAccount[]>();
    for (const acct of accounts) {
      const key = acct.accountGroup ?? "Other";
      const list = groups.get(key) ?? [];
      list.push(acct);
      groups.set(key, list);
    }

    // Sort groups by preferred order
    const sorted = Array.from(groups.entries()).sort(([a], [b]) => {
      const aKey = groupSortKey(a);
      const bKey = groupSortKey(b);
      if (aKey !== bKey) return aKey - bKey;
      return a.localeCompare(b);
    });

    return sorted;
  }, [accounts]);

  if (accounts.length === 0 && (!aggregateAccounts || aggregateAccounts.length === 0)) {
    return (
      <div className="rounded-lg border p-4 text-sm text-gray-500">
        No accounts found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Accounts</h2>

      {/* Grouped accounts */}
      {grouped.map(([groupName, groupAccounts]) => {
        const groupTotal = groupAccounts.reduce(
          (sum, a) => sum + a.liquidationValue,
          0
        );

        return (
          <div key={groupName}>
            {/* Group header */}
            <div className="flex items-baseline justify-between border-b border-gray-200 pb-1 mb-1">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                {groupName}
              </h3>
              <span className="text-sm font-medium text-gray-500">
                {formatDollar(groupTotal)}
              </span>
            </div>

            {/* Group accounts */}
            <div className="divide-y divide-gray-100">
              {groupAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  formatDollar={formatDollar}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Aggregate accounts (separate section with dashed border) */}
      {aggregateAccounts && aggregateAccounts.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between border-b border-dashed border-gray-300 pb-1 mb-1">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Aggregate Views
            </h3>
            <span className="text-xs text-gray-400">
              Combined across accounts — not added to total
            </span>
          </div>

          <div className="divide-y divide-gray-100">
            {aggregateAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                formatDollar={formatDollar}
                isAggregate
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Account card sub-component ──

function AccountCard({
  account,
  formatDollar,
  isAggregate,
}: {
  account: UnifiedAccount;
  formatDollar: (value: number, fractionDigits?: number) => React.ReactNode;
  isAggregate?: boolean;
}) {
  const sourceLabel =
    account.source === "schwab_api"
      ? "Schwab API"
      : account.source === "manual_upload"
        ? "Upload"
        : account.source === "quiltt"
          ? "Quiltt"
          : "Manual";

  return (
    <div
      className={`flex items-center gap-4 py-2 px-1 ${
        isAggregate ? "bg-gray-50/50" : ""
      }`}
    >
      {/* Institution · Type */}
      <span className="min-w-0 shrink-0 w-48 text-sm text-gray-500 truncate">
        {account.institution} &middot; {account.type}
      </span>

      {/* Account name */}
      <span className="min-w-0 flex-1 text-sm text-gray-700 truncate">
        {account.name}
      </span>

      {/* Balance */}
      <span className="shrink-0 text-sm font-semibold text-right w-28 tabular-nums">
        {formatDollar(account.liquidationValue)}
      </span>

      {/* Last synced */}
      <span className="hidden sm:block shrink-0 w-28 text-xs text-gray-400 text-right">
        {account.lastSyncedAt
          ? new Date(account.lastSyncedAt).toLocaleDateString()
          : "—"}
      </span>

      {/* Source badge */}
      <span className="shrink-0 w-20 text-right">
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          {sourceLabel}
        </span>
        {isAggregate && (
          <span className="ml-1 inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-600">
            Agg
          </span>
        )}
      </span>
    </div>
  );
}
