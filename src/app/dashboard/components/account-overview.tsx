"use client";

import { useEffect, useState } from "react";
import type { SchwabAccount } from "@/lib/schwab/types";

export function AccountOverview({ hideValues }: { hideValues: boolean }) {
  const [accounts, setAccounts] = useState<SchwabAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/schwab/accounts")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch accounts");
        return res.json();
      })
      .then(setAccounts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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

  if (loading) {
    return (
      <div className="rounded-lg border p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 rounded bg-gray-200" />
          <div className="h-8 w-48 rounded bg-gray-200" />
          <div className="flex gap-8">
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-200" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (accounts.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Accounts</h2>
      {accounts.map((account) => {
        const sec = account.securitiesAccount;
        const balances = sec.currentBalances;
        return (
          <div key={sec.accountNumber} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  {sec.type} &middot; ****
                  {sec.accountNumber.slice(-4)}
                </p>
                <p className="text-2xl font-bold">
                  {formatDollar(
                    balances?.liquidationValue ??
                      account.aggregatedBalance?.liquidationValue ??
                      0
                  )}
                </p>
              </div>
            </div>
            {balances && (
              <div className="mt-3 flex gap-6 text-sm text-gray-500">
                {balances.cashBalance !== undefined && (
                  <span>Cash: {formatDollar(balances.cashBalance)}</span>
                )}
                {balances.buyingPower !== undefined && (
                  <span>Buying Power: {formatDollar(balances.buyingPower)}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
