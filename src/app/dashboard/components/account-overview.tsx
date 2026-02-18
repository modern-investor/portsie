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
          <div key={groupName} className="space-y-3">
            {/* Group header */}
            <div className="flex items-baseline justify-between border-b border-gray-200 pb-1">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                {groupName}
              </h3>
              <span className="text-sm font-medium text-gray-500">
                {formatDollar(groupTotal)}
              </span>
            </div>

            {/* Group accounts */}
            {groupAccounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                formatDollar={formatDollar}
              />
            ))}
          </div>
        );
      })}

      {/* Aggregate accounts (separate section with dashed border) */}
      {aggregateAccounts && aggregateAccounts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between border-b border-dashed border-gray-300 pb-1">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Aggregate Views
            </h3>
            <span className="text-xs text-gray-400">
              Combined across accounts — not added to total
            </span>
          </div>

          {aggregateAccounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              formatDollar={formatDollar}
              isAggregate
            />
          ))}
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
  return (
    <div
      className={`rounded-lg border p-4 ${
        isAggregate ? "border-dashed border-gray-300 bg-gray-50/50" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            {account.institution} &middot; {account.type}
          </p>
          <p className="text-2xl font-bold">
            {formatDollar(account.liquidationValue)}
          </p>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {account.source === "schwab_api"
              ? "Schwab API"
              : account.source === "manual_upload"
                ? "Upload"
                : account.source === "quiltt"
                  ? "Quiltt"
                  : account.source === "offline"
                    ? "Manual"
                    : "Manual"}
          </span>
          {isAggregate && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
              Aggregate
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1 text-sm text-gray-500 sm:flex-row sm:gap-6">
        <span>{account.name}</span>
        {account.cashBalance > 0 && (
          <span>Cash: {formatDollar(account.cashBalance)}</span>
        )}
        {account.holdingsCount > 0 && (
          <span>Holdings: {account.holdingsCount}</span>
        )}
        {account.lastSyncedAt && (
          <span className="text-xs text-gray-400">
            Last synced: {new Date(account.lastSyncedAt).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}
