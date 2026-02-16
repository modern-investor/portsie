"use client";

import { useEffect, useState } from "react";
import type { SchwabPosition } from "@/lib/schwab/types";

export function PositionsTable({ hideValues }: { hideValues: boolean }) {
  const [positions, setPositions] = useState<SchwabPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/schwab/positions")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch positions");
        return res.json();
      })
      .then(setPositions)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-24 rounded bg-gray-200" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 rounded bg-gray-200" />
          ))}
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

  if (positions.length === 0) {
    return (
      <div className="rounded-lg border p-4 text-sm text-gray-500">
        No positions found.
      </div>
    );
  }

  const totalMarketValue = positions.reduce(
    (sum, pos) => sum + pos.marketValue,
    0
  );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Positions</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Symbol</th>
              {!hideValues && (
                <th className="px-4 py-3 font-medium">Quantity</th>
              )}
              <th className="px-4 py-3 font-medium text-right">Avg Price</th>
              {!hideValues && (
                <th className="px-4 py-3 font-medium text-right">
                  Market Value
                </th>
              )}
              <th className="px-4 py-3 font-medium text-right">Alloc %</th>
              {!hideValues && (
                <th className="px-4 py-3 font-medium text-right">Day P&L</th>
              )}
              <th className="px-4 py-3 font-medium text-right">Day P&L %</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((pos) => {
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
                  key={pos.instrument.symbol}
                  className="border-b last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{pos.instrument.symbol}</div>
                    {pos.instrument.description && (
                      <div className="text-xs text-gray-400 truncate max-w-[200px]">
                        {pos.instrument.description}
                      </div>
                    )}
                  </td>
                  {!hideValues && (
                    <td className="px-4 py-3">{pos.longQuantity}</td>
                  )}
                  <td className="px-4 py-3 text-right">
                    ${pos.averagePrice.toFixed(2)}
                  </td>
                  {!hideValues && (
                    <td className="px-4 py-3 text-right">
                      $
                      {pos.marketValue.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    {allocationPct.toFixed(1)}%
                  </td>
                  {!hideValues && (
                    <td className={`px-4 py-3 text-right ${plColor}`}>
                      {pos.currentDayProfitLoss >= 0 ? "+" : ""}$
                      {pos.currentDayProfitLoss.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  )}
                  <td className={`px-4 py-3 text-right ${plColor}`}>
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
