"use client";

import { useState } from "react";
import type { UnifiedPosition } from "@/app/api/portfolio/positions/route";

interface Props {
  positions: UnifiedPosition[];
  hideValues: boolean;
}

export function PositionsTable({ positions, hideValues }: Props) {
  const [accountFilter, setAccountFilter] = useState<string | null>(null);

  if (positions.length === 0) {
    return (
      <div className="rounded-lg border p-4 text-sm text-gray-500">
        No positions found.
      </div>
    );
  }

  // Get unique account names for filter dropdown
  const accountNames = Array.from(
    new Set(positions.map((p) => p.accountName).filter(Boolean))
  ) as string[];

  const filtered = accountFilter
    ? positions.filter((p) => p.accountName === accountFilter)
    : positions;

  const totalMarketValue = filtered.reduce(
    (sum, pos) => sum + pos.marketValue,
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Positions</h2>
        {accountNames.length > 1 && (
          <select
            value={accountFilter ?? ""}
            onChange={(e) => setAccountFilter(e.target.value || null)}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">All Accounts</option>
            {accountNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-2 py-2 font-medium sm:px-4 sm:py-3">Symbol</th>
              {accountNames.length > 1 && !accountFilter && (
                <th className="px-2 py-2 font-medium sm:px-4 sm:py-3">Account</th>
              )}
              {!hideValues && (
                <th className="px-2 py-2 font-medium sm:px-4 sm:py-3">Quantity</th>
              )}
              <th className="px-2 py-2 font-medium sm:px-4 sm:py-3 text-right">Avg Price</th>
              {!hideValues && (
                <th className="px-2 py-2 font-medium sm:px-4 sm:py-3 text-right">
                  Market Value
                </th>
              )}
              <th className="px-2 py-2 font-medium sm:px-4 sm:py-3 text-right">Alloc %</th>
              {!hideValues && (
                <th className="px-2 py-2 font-medium sm:px-4 sm:py-3 text-right">Day P&L</th>
              )}
              <th className="px-2 py-2 font-medium sm:px-4 sm:py-3 text-right">Day P&L %</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((pos, i) => {
              const plColor =
                pos.currentDayProfitLoss >= 0
                  ? "text-green-600"
                  : "text-red-600";
              const allocationPct =
                totalMarketValue > 0
                  ? (pos.marketValue / totalMarketValue) * 100
                  : 0;
              return (
                <tr
                  key={`${pos.accountId}-${pos.symbol}-${i}`}
                  className="border-b last:border-b-0"
                >
                  <td className="px-2 py-2 sm:px-4 sm:py-3">
                    <div className="font-medium">{pos.symbol}</div>
                    {pos.description && (
                      <div className="text-xs text-gray-400 truncate max-w-[120px] sm:max-w-[200px]">
                        {pos.description}
                      </div>
                    )}
                  </td>
                  {accountNames.length > 1 && !accountFilter && (
                    <td className="px-2 py-2 sm:px-4 sm:py-3 text-xs text-gray-500">
                      {pos.accountName}
                    </td>
                  )}
                  {!hideValues && (
                    <td className="px-2 py-2 sm:px-4 sm:py-3">{pos.quantity}</td>
                  )}
                  <td className="px-2 py-2 text-right sm:px-4 sm:py-3">
                    ${pos.averagePrice.toFixed(2)}
                  </td>
                  {!hideValues && (
                    <td className="px-2 py-2 text-right sm:px-4 sm:py-3">
                      $
                      {pos.marketValue.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  )}
                  <td className="px-2 py-2 text-right sm:px-4 sm:py-3">
                    {allocationPct.toFixed(1)}%
                  </td>
                  {!hideValues && (
                    <td className={`px-2 py-2 text-right sm:px-4 sm:py-3 ${plColor}`}>
                      {pos.currentDayProfitLoss >= 0 ? "+" : ""}$
                      {pos.currentDayProfitLoss.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  )}
                  <td className={`px-2 py-2 text-right sm:px-4 sm:py-3 ${plColor}`}>
                    {pos.currentDayProfitLossPercentage >= 0 ? "+" : ""}
                    {pos.currentDayProfitLossPercentage.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
