"use client";

import { ArrowLeft } from "lucide-react";
import type { AssetClassSummary, AssetClassId, ClassifiedPortfolio } from "@/lib/portfolio/types";
import { getCryptoSubAggregates, getTechSubAggregates } from "@/lib/portfolio";

const DOT_MAP: Record<string, string> = {
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  cyan: "bg-cyan-500",
  amber: "bg-amber-500",
  yellow: "bg-yellow-500",
  emerald: "bg-emerald-500",
  red: "bg-red-500",
  slate: "bg-slate-500",
};

interface Props {
  classId: AssetClassId;
  portfolio: ClassifiedPortfolio;
  hideValues: boolean;
  onBack: () => void;
}

export function AssetClassDetail({ classId, portfolio, hideValues, onBack }: Props) {
  const summary = portfolio.assetClasses.find((ac) => ac.def.id === classId);
  if (!summary) return null;

  const dotClass = DOT_MAP[summary.def.color] ?? "bg-gray-500";

  // Get sub-aggregates for applicable classes
  const subAggregates =
    classId === "crypto"
      ? getCryptoSubAggregates(summary.positions, portfolio.totalMarketValue)
      : classId === "tech_equities"
        ? getTechSubAggregates(
            summary.positions,
            portfolio.assetClasses.find((ac) => ac.def.id === "tech_options")?.positions ?? [],
            portfolio.totalMarketValue
          )
        : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className={`h-3 w-3 rounded-full ${dotClass}`} />
        <h2 className="text-lg font-semibold">{summary.def.label}</h2>
        <span className="text-sm text-gray-500 tabular-nums">
          {(summary.allocationPct ?? 0).toFixed(1)}% of portfolio
        </span>
      </div>

      {/* Summary stats */}
      <div className="flex flex-wrap gap-6 text-sm">
        <div>
          <span className="text-gray-500">Market Value</span>
          <p className="text-lg font-bold tabular-nums">
            {hideValues ? (
              <span className="text-gray-300 select-none">$*****</span>
            ) : (
              `$${summary.marketValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
            )}
          </p>
        </div>
        <div>
          <span className="text-gray-500">Day Change</span>
          <p className={`text-lg font-bold tabular-nums ${summary.dayChange >= 0 ? "text-green-600" : "text-red-600"}`}>
            {hideValues ? (
              <span className="text-gray-300 select-none">$*****</span>
            ) : (
              `${summary.dayChange >= 0 ? "+" : ""}$${summary.dayChange.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
            )}
          </p>
        </div>
        <div>
          <span className="text-gray-500">Holdings</span>
          <p className="text-lg font-bold">{summary.holdingCount}</p>
        </div>
      </div>

      {/* Sub-aggregates (if applicable) */}
      {subAggregates && subAggregates.length > 1 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Sub-categories
          </h3>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
            {subAggregates.map((sub) => (
              <div key={sub.label} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{sub.label}</p>
                <p className="text-lg font-bold tabular-nums">
                  {hideValues ? (
                    <span className="text-gray-300 select-none">$*****</span>
                  ) : (
                    `$${sub.marketValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                  )}
                </p>
                <p className="text-xs text-gray-500 tabular-nums">
                  {(sub.allocationPct ?? 0).toFixed(1)}% &middot; {sub.positions.length} holding{sub.positions.length !== 1 ? "s" : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Positions table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-2 py-2 font-medium sm:px-4 sm:py-3">Symbol</th>
              {!hideValues && (
                <th className="px-2 py-2 font-medium sm:px-4 sm:py-3">Qty</th>
              )}
              {!hideValues && (
                <th className="px-2 py-2 font-medium text-right sm:px-4 sm:py-3">
                  Market Value
                </th>
              )}
              <th className="px-2 py-2 font-medium text-right sm:px-4 sm:py-3">
                Alloc %
              </th>
              <th className="px-2 py-2 font-medium text-right sm:px-4 sm:py-3">
                Cumul %
              </th>
              {!hideValues && (
                <th className="px-2 py-2 font-medium text-right sm:px-4 sm:py-3">
                  Day P&L
                </th>
              )}
              <th className="px-2 py-2 font-medium text-right sm:px-4 sm:py-3">
                Day P&L %
              </th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let cumPct = 0;
              return summary.positions.map((pos) => {
                // Cumulative % within this asset class
                const classTotal = summary.marketValue;
                const posClassPct = classTotal > 0 ? (pos.marketValue / classTotal) * 100 : 0;
                cumPct += posClassPct;
                const plColor = (pos.currentDayProfitLoss ?? 0) >= 0 ? "text-green-600" : "text-red-600";

                return (
                  <tr key={pos.symbol} className="border-b last:border-b-0">
                    <td className="px-2 py-2 sm:px-4 sm:py-3">
                      <div className="font-medium">{pos.symbol}</div>
                      {pos.description && (
                        <div className="text-xs text-gray-400 truncate max-w-[140px] sm:max-w-[220px]">
                          {pos.description}
                        </div>
                      )}
                      {pos.subCategory && (
                        <div className="text-xs text-blue-500">{pos.subCategory}</div>
                      )}
                    </td>
                    {!hideValues && (
                      <td className="px-2 py-2 sm:px-4 sm:py-3 tabular-nums">
                        {pos.quantity.toLocaleString()}
                      </td>
                    )}
                    {!hideValues && (
                      <td className="px-2 py-2 text-right sm:px-4 sm:py-3 tabular-nums">
                        ${(pos.marketValue ?? 0).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    )}
                    <td className="px-2 py-2 text-right sm:px-4 sm:py-3 tabular-nums">
                      {(pos.allocationPct ?? 0).toFixed(1)}%
                    </td>
                    <td className="px-2 py-2 text-right sm:px-4 sm:py-3 tabular-nums text-gray-500">
                      {cumPct.toFixed(1)}%
                    </td>
                    {!hideValues && (
                      <td className={`px-2 py-2 text-right sm:px-4 sm:py-3 tabular-nums ${plColor}`}>
                        {(pos.currentDayProfitLoss ?? 0) >= 0 ? "+" : ""}$
                        {(pos.currentDayProfitLoss ?? 0).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    )}
                    <td className={`px-2 py-2 text-right sm:px-4 sm:py-3 tabular-nums ${plColor}`}>
                      {(pos.currentDayProfitLossPercentage ?? 0) >= 0 ? "+" : ""}
                      {(pos.currentDayProfitLossPercentage ?? 0).toFixed(2)}%
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
          {/* Totals row */}
          <tfoot>
            <tr className="border-t bg-gray-50 font-semibold">
              <td className="px-2 py-2 sm:px-4 sm:py-3">
                Total ({summary.holdingCount} holdings)
              </td>
              {!hideValues && <td className="px-2 py-2 sm:px-4 sm:py-3" />}
              {!hideValues && (
                <td className="px-2 py-2 text-right sm:px-4 sm:py-3 tabular-nums">
                  ${summary.marketValue.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              )}
              <td className="px-2 py-2 text-right sm:px-4 sm:py-3 tabular-nums">
                {(summary.allocationPct ?? 0).toFixed(1)}%
              </td>
              <td className="px-2 py-2 text-right sm:px-4 sm:py-3 tabular-nums text-gray-500">
                100.0%
              </td>
              {!hideValues && (
                <td className={`px-2 py-2 text-right sm:px-4 sm:py-3 tabular-nums ${summary.dayChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {summary.dayChange >= 0 ? "+" : ""}$
                  {summary.dayChange.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              )}
              <td className="px-2 py-2 sm:px-4 sm:py-3" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
