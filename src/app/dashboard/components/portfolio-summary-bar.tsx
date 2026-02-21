"use client";

import type { ClassifiedPortfolio } from "@/lib/portfolio/types";

interface Props {
  portfolio: ClassifiedPortfolio;
  hideValues: boolean;
  priceDate?: string | null;
}

function formatPriceDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PortfolioSummaryBar({ portfolio, hideValues, priceDate }: Props) {
  const { totalMarketValue, totalDayChange, totalDayChangePct, holdingCount, cashValue, cashPct, liabilityValue, liabilityPct } =
    portfolio;

  const dayColor = totalDayChange >= 0 ? "text-green-600" : "text-red-600";

  return (
    <div className="rounded-lg border bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start gap-x-10 gap-y-3 sm:gap-x-14">
        {/* Total value */}
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Portfolio</p>
          <p className="text-2xl font-bold tabular-nums sm:text-3xl">
            {hideValues ? (
              <span className="text-gray-300 select-none">$*****</span>
            ) : (
              `$${totalMarketValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            )}
          </p>
        </div>

        {/* Day change */}
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Day Change</p>
          <p className={`text-lg font-semibold tabular-nums ${dayColor}`}>
            {hideValues ? (
              <span className="text-gray-300 select-none">$*****</span>
            ) : (
              <>
                {totalDayChange >= 0 ? "+" : ""}$
                {totalDayChange.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                <span className="text-sm">
                  ({(totalDayChangePct ?? 0) >= 0 ? "+" : ""}
                  {(totalDayChangePct ?? 0).toFixed(2)}%)
                </span>
              </>
            )}
          </p>
        </div>

        {/* Holdings count */}
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Holdings</p>
          <p className="text-lg font-semibold">{holdingCount}</p>
        </div>

        {/* Cash */}
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Cash</p>
          <p className="text-lg font-semibold tabular-nums">
            {hideValues ? (
              <span className="text-gray-300 select-none">$*****</span>
            ) : (
              <>
                ${cashValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                <span className="text-sm text-gray-500 ml-1">({(cashPct ?? 0).toFixed(1)}%)</span>
              </>
            )}
          </p>
        </div>

        {/* Debt/Liabilities (only shown if there are liabilities) */}
        {liabilityValue < 0 && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Debt</p>
            <p className="text-lg font-semibold tabular-nums text-red-600">
              {hideValues ? (
                <span className="text-gray-300 select-none">$*****</span>
              ) : (
                <>
                  -${Math.abs(liabilityValue).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  <span className="text-sm text-gray-500 ml-1">({Math.abs(liabilityPct ?? 0).toFixed(1)}%)</span>
                </>
              )}
            </p>
          </div>
        )}

        {/* Price date */}
        {priceDate && (
          <div className="ml-auto self-end">
            <p className="text-xs text-gray-400">
              As of {formatPriceDate(priceDate)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
