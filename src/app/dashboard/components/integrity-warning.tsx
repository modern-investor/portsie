"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, X } from "lucide-react";
import type { PortfolioDiscrepancy } from "@/app/api/portfolio/positions/route";

const DISMISS_KEY = "portsie:integrity-dismissed";

interface Props {
  discrepancies: PortfolioDiscrepancy[];
  hideValues: boolean;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function IntegrityWarning({ discrepancies, hideValues }: Props) {
  const [dismissed, setDismissed] = useState(false);

  // On mount, check localStorage for dismissal (avoids SSR/client hydration mismatch)
  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "true") setDismissed(true);
  }, []);
  const [expanded, setExpanded] = useState(false);

  if (dismissed || discrepancies.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-amber-800">
              Portfolio totals may differ from source documents
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setExpanded(!expanded)}
                className="rounded p-1 text-amber-600 hover:bg-amber-100 transition-colors"
                aria-label={expanded ? "Collapse details" : "Expand details"}
              >
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={() => {
                  setDismissed(true);
                  localStorage.setItem(DISMISS_KEY, "true");
                }}
                className="rounded p-1 text-amber-600 hover:bg-amber-100 transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-amber-700">
            {discrepancies.length} account{discrepancies.length > 1 ? "s" : ""}{" "}
            with discrepancies detected. Re-upload statements for the most accurate data.
          </p>

          {expanded && (
            <div className="mt-3 space-y-2">
              {discrepancies.map((d) => (
                <div
                  key={d.accountId}
                  className="rounded border border-amber-200 bg-white p-3 text-xs"
                >
                  <p className="font-medium text-gray-900">{d.accountName}</p>
                  <div className="mt-1 grid grid-cols-3 gap-2 text-gray-600">
                    <div>
                      <span className="text-gray-400">Document:</span>{" "}
                      {hideValues ? "$*****" : `$${fmt(d.documentTotal)}`}
                    </div>
                    <div>
                      <span className="text-gray-400">Computed:</span>{" "}
                      {hideValues ? "$*****" : `$${fmt(d.computedTotal)}`}
                    </div>
                    <div>
                      <span className="text-gray-400">Diff:</span>{" "}
                      <span className="text-amber-700 font-medium">
                        {hideValues
                          ? "$*****"
                          : `$${fmt(Math.abs(d.difference))} (${d.differencePct.toFixed(1)}%)`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
