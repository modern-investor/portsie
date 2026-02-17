"use client";

import type {
  UploadedStatement,
  LLMExtractionResult,
} from "@/lib/upload/types";

const CONFIDENCE_STYLES = {
  high: { label: "High confidence", className: "text-green-700 bg-green-100" },
  medium: {
    label: "Medium confidence",
    className: "text-amber-700 bg-amber-100",
  },
  low: { label: "Low confidence", className: "text-red-700 bg-red-100" },
};

export function UploadReview({
  upload,
  onReprocess,
  onClose,
}: {
  upload: UploadedStatement;
  onReprocess: () => void;
  onClose: () => void;
}) {
  const extraction = upload.extracted_data as LLMExtractionResult | null;
  if (!extraction) return null;

  const confidence = CONFIDENCE_STYLES[extraction.confidence];
  const totalTransactions = extraction.transactions.length;
  const totalPositions = extraction.positions.length;
  const totalBalances = extraction.balances.length;

  return (
    <div className="space-y-4 rounded-lg border bg-white p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="truncate text-base font-semibold sm:text-lg">Review: {upload.filename}</h3>
          <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
            {extraction.statement_start_date && (
              <span>
                {extraction.statement_start_date}
                {extraction.statement_end_date &&
                  ` to ${extraction.statement_end_date}`}
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${confidence.className}`}
            >
              {confidence.label}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 -m-2 text-gray-400 hover:text-gray-600"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Account info detected */}
      {extraction.account_info && (
        <div className="rounded-md bg-gray-50 p-3 text-sm">
          <span className="font-medium text-gray-700">Detected account: </span>
          <span className="text-gray-600">
            {[
              extraction.account_info.institution_name,
              extraction.account_info.account_type,
              extraction.account_info.account_number
                ? `****${extraction.account_info.account_number.slice(-4)}`
                : null,
            ]
              .filter(Boolean)
              .join(" — ") || "Unknown"}
          </span>
        </div>
      )}

      {/* Notes / warnings from LLM */}
      {extraction.notes.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Notes:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {extraction.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary counts */}
      <div className="flex flex-wrap gap-2 text-sm sm:gap-4">
        <span className="rounded-md bg-blue-50 px-3 py-1 text-blue-700">
          {totalTransactions} transaction{totalTransactions !== 1 ? "s" : ""}
        </span>
        <span className="rounded-md bg-purple-50 px-3 py-1 text-purple-700">
          {totalPositions} position{totalPositions !== 1 ? "s" : ""}
        </span>
        <span className="rounded-md bg-teal-50 px-3 py-1 text-teal-700">
          {totalBalances} balance snapshot{totalBalances !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Transactions table */}
      {totalTransactions > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">Transactions</h4>
          <div className="max-h-64 overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="sticky top-0 border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">Date</th>
                  <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">Action</th>
                  <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">Symbol</th>
                  <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">Description</th>
                  <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2 text-right">Qty</th>
                  <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2 text-right">Price</th>
                  <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {extraction.transactions.map((t, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="px-2 py-1.5 whitespace-nowrap sm:px-3 sm:py-2">
                      {t.transaction_date}
                    </td>
                    <td className="px-2 py-1.5 sm:px-3 sm:py-2">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono">
                        {t.action}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">
                      {t.symbol ?? "—"}
                    </td>
                    <td className="max-w-[100px] truncate px-2 py-1.5 text-gray-500 sm:max-w-[200px] sm:px-3 sm:py-2">
                      {t.description}
                    </td>
                    <td className="px-2 py-1.5 text-right sm:px-3 sm:py-2">
                      {t.quantity ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right sm:px-3 sm:py-2">
                      {t.price_per_share
                        ? `$${t.price_per_share.toFixed(2)}`
                        : "—"}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right sm:px-3 sm:py-2 font-medium ${
                        t.total_amount >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {t.total_amount >= 0 ? "+" : ""}$
                      {Math.abs(t.total_amount).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Positions table */}
      {totalPositions > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">Positions</h4>
          <div className="max-h-48 overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="sticky top-0 border-b bg-gray-50 text-left text-gray-500">
                  <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">Symbol</th>
                  <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2 text-right">Qty</th>
                  <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2 text-right">
                    Avg Cost
                  </th>
                  <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2 text-right">
                    Mkt Price
                  </th>
                  <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2 text-right">
                    Mkt Value
                  </th>
                  <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2 text-right">
                    Unrealized P&L
                  </th>
                </tr>
              </thead>
              <tbody>
                {extraction.positions.map((p, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">{p.symbol}</td>
                    <td className="px-2 py-1.5 text-right sm:px-3 sm:py-2">{p.quantity}</td>
                    <td className="px-2 py-1.5 text-right sm:px-3 sm:py-2">
                      {p.average_cost_basis
                        ? `$${p.average_cost_basis.toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right sm:px-3 sm:py-2">
                      {p.market_price_per_share
                        ? `$${p.market_price_per_share.toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right sm:px-3 sm:py-2">
                      {p.market_value
                        ? `$${p.market_value.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}`
                        : "—"}
                    </td>
                    <td
                      className={`px-2 py-1.5 text-right sm:px-3 sm:py-2 ${
                        (p.unrealized_profit_loss ?? 0) >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {p.unrealized_profit_loss != null
                        ? `${p.unrealized_profit_loss >= 0 ? "+" : ""}$${Math.abs(
                            p.unrealized_profit_loss
                          ).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                          })}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Balance snapshots */}
      {totalBalances > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">
            Balance Snapshots
          </h4>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {extraction.balances.map((b, i) => (
              <div key={i} className="rounded-md border p-3 text-sm">
                <p className="text-xs text-gray-400">{b.snapshot_date}</p>
                {b.liquidation_value != null && (
                  <p>
                    <span className="text-gray-500">Total: </span>
                    <span className="font-medium">
                      $
                      {b.liquidation_value.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </p>
                )}
                {b.cash_balance != null && (
                  <p>
                    <span className="text-gray-500">Cash: </span>$
                    {b.cash_balance.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                )}
                {b.buying_power != null && (
                  <p>
                    <span className="text-gray-500">Buying power: </span>$
                    {b.buying_power.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-4 sm:gap-3">
        {upload.confirmed_at ? (
          <span className="rounded-md bg-green-100 px-3 py-2 text-sm font-medium text-green-700">
            Saved to account
          </span>
        ) : (
          <span className="rounded-md bg-amber-100 px-3 py-2 text-sm font-medium text-amber-700">
            Not yet saved — re-process to retry
          </span>
        )}
        <button
          onClick={onReprocess}
          className="rounded-md border px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Re-process
        </button>
        <button
          onClick={onClose}
          className="px-2 py-2 text-sm text-gray-500 hover:text-gray-700"
        >
          Close
        </button>
      </div>
    </div>
  );
}
