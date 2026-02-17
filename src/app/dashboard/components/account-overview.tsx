"use client";

import type { UnifiedAccount } from "@/app/api/portfolio/positions/route";

interface Props {
  accounts: UnifiedAccount[];
  hideValues: boolean;
}

export function AccountOverview({ accounts, hideValues }: Props) {
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

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border p-4 text-sm text-gray-500">
        No accounts found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Accounts</h2>
      {accounts.map((account) => (
        <div key={account.id} className="rounded-lg border p-4">
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
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-1 text-sm text-gray-500 sm:flex-row sm:gap-6">
            <span>{account.name}</span>
            {account.cashBalance > 0 && (
              <span>Cash: {formatDollar(account.cashBalance)}</span>
            )}
            <span>Holdings: {account.holdingsCount}</span>
            {account.lastSyncedAt && (
              <span className="text-xs text-gray-400">
                Last synced: {new Date(account.lastSyncedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
