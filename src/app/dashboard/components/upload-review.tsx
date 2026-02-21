"use client";

import { useState } from "react";
import type { UploadedStatement } from "@/lib/upload/types";
import type {
  PortsieExtraction,
  ExtractionAccount,
  ExtractionPosition,
  ExtractionTransaction,
} from "@/lib/extraction/schema";
import { compareExtractions } from "@/lib/extraction/compare";
import type { ComparisonResult } from "@/lib/extraction/compare";

const CONFIDENCE_STYLES = {
  high: { label: "High confidence", className: "text-green-700 bg-green-100" },
  medium: {
    label: "Medium confidence",
    className: "text-amber-700 bg-amber-100",
  },
  low: { label: "Low confidence", className: "text-red-700 bg-red-100" },
};

function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

/** Summarize accounts for the multi-account header card */
function AccountsSummary({ accounts }: { accounts: ExtractionAccount[] }) {
  // Group by account_group
  const groups = new Map<string, ExtractionAccount[]>();
  for (const acct of accounts) {
    const group = acct.account_info.account_group || "Other";
    const list = groups.get(group) ?? [];
    list.push(acct);
    groups.set(group, list);
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-700">
        {accounts.length} Accounts Detected
      </h4>
      <div className="max-h-64 overflow-auto rounded-md border">
        <table className="w-full text-xs">
          <thead>
            <tr className="sticky top-0 border-b bg-gray-50 text-left text-gray-500">
              <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">Account</th>
              <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">Type</th>
              <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">Institution</th>
              <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2 text-right">Value</th>
              <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2 text-right">Positions</th>
              <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2 text-right">Txns</th>
            </tr>
          </thead>
          <tbody>
            {[...groups.entries()].map(([group, accts]) => (
              <AccountGroupRows key={group} group={group} accounts={accts} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountGroupRows({ group, accounts }: { group: string; accounts: ExtractionAccount[] }) {
  return (
    <>
      <tr className="bg-gray-100">
        <td colSpan={6} className="px-2 py-1 text-xs font-semibold text-gray-600 sm:px-3">
          {group}
        </td>
      </tr>
      {accounts.map((acct, i) => {
        const balance = acct.balances[0];
        const value = balance?.liquidation_value ?? null;
        return (
          <tr key={i} className="border-b last:border-b-0">
            <td className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">
              {acct.account_info.account_nickname || "—"}
              {acct.account_info.account_number && (
                <span className="ml-1 text-gray-400">
                  ...{acct.account_info.account_number.replace(/^\.+/, "").slice(-3)}
                </span>
              )}
            </td>
            <td className="px-2 py-1.5 sm:px-3 sm:py-2">
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-600">
                {acct.account_info.account_type || "—"}
              </span>
            </td>
            <td className="px-2 py-1.5 text-gray-500 sm:px-3 sm:py-2">
              {acct.account_info.institution_name || "—"}
            </td>
            <td className={`px-2 py-1.5 text-right font-medium sm:px-3 sm:py-2 ${
              value !== null && value < 0 ? "text-red-600" : ""
            }`}>
              {value !== null ? formatCurrency(value) : "—"}
            </td>
            <td className="px-2 py-1.5 text-right text-gray-500 sm:px-3 sm:py-2">
              {acct.positions.length || "—"}
            </td>
            <td className="px-2 py-1.5 text-right text-gray-500 sm:px-3 sm:py-2">
              {acct.transactions.length || "—"}
            </td>
          </tr>
        );
      })}
    </>
  );
}

/** Positions table — shared between per-account and unallocated positions */
function PositionsTable({ positions, title }: { positions: ExtractionPosition[]; title: string }) {
  if (positions.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-gray-700">{title}</h4>
      <div className="max-h-48 overflow-auto rounded-md border">
        <table className="w-full text-xs">
          <thead>
            <tr className="sticky top-0 border-b bg-gray-50 text-left text-gray-500">
              <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">Symbol</th>
              <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2 text-right">Qty</th>
              <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2 text-right">Avg Cost</th>
              <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2 text-right">Mkt Price</th>
              <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2 text-right">Mkt Value</th>
              <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2 text-right">Unrealized P&L</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p, i) => (
              <tr key={i} className="border-b last:border-b-0">
                <td className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">
                  {p.symbol}
                  {p.description && (
                    <span className="ml-1 text-gray-400 text-[10px]">{p.description}</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right sm:px-3 sm:py-2">{p.quantity}</td>
                <td className="px-2 py-1.5 text-right sm:px-3 sm:py-2">
                  {p.average_cost_basis ? `$${p.average_cost_basis.toFixed(2)}` : "—"}
                </td>
                <td className="px-2 py-1.5 text-right sm:px-3 sm:py-2">
                  {p.market_price_per_share ? `$${p.market_price_per_share.toFixed(2)}` : "—"}
                </td>
                <td className="px-2 py-1.5 text-right sm:px-3 sm:py-2">
                  {p.market_value
                    ? `$${p.market_value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                    : "—"}
                </td>
                <td
                  className={`px-2 py-1.5 text-right sm:px-3 sm:py-2 ${
                    (p.unrealized_profit_loss ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {p.unrealized_profit_loss != null
                    ? `${p.unrealized_profit_loss >= 0 ? "+" : ""}$${Math.abs(
                        p.unrealized_profit_loss
                      ).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Transactions table */
function TransactionsTable({ transactions }: { transactions: ExtractionTransaction[] }) {
  if (transactions.length === 0) return null;
  return (
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
            {transactions.map((t, i) => (
              <tr key={i} className="border-b last:border-b-0">
                <td className="px-2 py-1.5 whitespace-nowrap sm:px-3 sm:py-2">
                  {t.transaction_date}
                </td>
                <td className="px-2 py-1.5 sm:px-3 sm:py-2">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono">{t.action}</span>
                </td>
                <td className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">{t.symbol ?? "—"}</td>
                <td className="max-w-[100px] truncate px-2 py-1.5 text-gray-500 sm:max-w-[200px] sm:px-3 sm:py-2">
                  {t.description}
                </td>
                <td className="px-2 py-1.5 text-right sm:px-3 sm:py-2">{t.quantity ?? "—"}</td>
                <td className="px-2 py-1.5 text-right sm:px-3 sm:py-2">
                  {t.price_per_share ? `$${t.price_per_share.toFixed(2)}` : "—"}
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
  );
}

/** Format model name for display */
function formatModelName(model: string): string {
  const names: Record<string, string> = {
    "claude-sonnet-4-6": "Sonnet 4.6",
    "claude-opus-4-6": "Opus 4.6",
    "claude-sonnet-4-5-20250929": "Sonnet 4.5",
    "gemini-3-flash-preview": "Gemini 3 Flash",
    "gemini-2.5-flash": "Gemini 2.5 Flash",
  };
  return names[model] || model;
}

/** Verification comparison section */
function VerificationSection({
  primaryExtraction,
  verificationData,
  verificationError,
  verificationSettings,
  processingSettings,
}: {
  primaryExtraction: PortsieExtraction;
  verificationData: PortsieExtraction | null;
  verificationError: string | null;
  verificationSettings: { backend: string; model: string } | null;
  processingSettings: { backend: string; model: string; preset?: string; label?: string } | null;
}) {
  const [showDetails, setShowDetails] = useState(false);

  const primaryLabel = processingSettings
    ? formatModelName(processingSettings.model)
    : "Primary";
  const verifyLabel = verificationSettings
    ? formatModelName(verificationSettings.model)
    : "Verification";

  if (verificationError) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="font-medium">Verification failed</p>
        </div>
        <p className="mt-1 text-xs">{verificationError}</p>
        <p className="mt-1 text-xs text-amber-600">
          {primaryLabel} (primary) → {verifyLabel} (verification)
        </p>
      </div>
    );
  }

  if (!verificationData) return null;

  const comparison: ComparisonResult = compareExtractions(primaryExtraction, verificationData);

  const isAgreement = comparison.agreement === "full";
  const isMinor = comparison.agreement === "minor_differences";

  return (
    <div
      className={`rounded-md border p-3 text-sm ${
        isAgreement
          ? "border-green-200 bg-green-50"
          : isMinor
            ? "border-amber-200 bg-amber-50"
            : "border-red-200 bg-red-50"
      }`}
    >
      {/* Outcome summary line */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {isAgreement ? (
            <svg className="h-4 w-4 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          )}
          <div>
            <p className={`font-medium ${isAgreement ? "text-green-800" : isMinor ? "text-amber-800" : "text-red-800"}`}>
              {isAgreement
                ? "Models in agreement"
                : isMinor
                  ? "Minor discrepancies detected"
                  : "Significant discrepancies detected"}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {primaryLabel} → {verifyLabel}
              {!isAgreement && (
                <span>
                  {" · "}
                  {comparison.summary.errors > 0 && (
                    <span className="font-medium text-red-600">
                      {comparison.summary.errors} error{comparison.summary.errors !== 1 ? "s" : ""}
                    </span>
                  )}
                  {comparison.summary.errors > 0 && comparison.summary.warnings > 0 && ", "}
                  {comparison.summary.warnings > 0 && (
                    <span className="font-medium text-amber-600">
                      {comparison.summary.warnings} warning{comparison.summary.warnings !== 1 ? "s" : ""}
                    </span>
                  )}
                  {(comparison.summary.errors > 0 || comparison.summary.warnings > 0) && comparison.summary.infos > 0 && ", "}
                  {comparison.summary.infos > 0 && (
                    <span className="text-gray-500">
                      {comparison.summary.infos} info
                    </span>
                  )}
                </span>
              )}
            </p>
          </div>
        </div>

        {comparison.discrepancies.length > 0 && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="shrink-0 text-xs text-gray-500 hover:text-gray-700 underline"
          >
            {showDetails ? "Hide details" : "Show details"}
          </button>
        )}
      </div>

      {/* Agreement detail */}
      {isAgreement && (
        <p className="mt-1.5 text-xs text-green-700">
          Both models produced identical extraction results.
        </p>
      )}

      {/* Discrepancy table (collapsible) */}
      {showDetails && comparison.discrepancies.length > 0 && (
        <div className="mt-3 max-h-48 overflow-auto rounded-md border bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="sticky top-0 border-b bg-gray-50 text-left text-gray-500">
                <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">Issue</th>
                <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">{primaryLabel}</th>
                <th className="px-2 py-1.5 font-medium sm:px-3 sm:py-2">{verifyLabel}</th>
              </tr>
            </thead>
            <tbody>
              {comparison.discrepancies.map((d, i) => (
                <tr
                  key={i}
                  className={`border-b last:border-b-0 ${
                    d.severity === "error"
                      ? "bg-red-50"
                      : d.severity === "warning"
                        ? "bg-amber-50"
                        : ""
                  }`}
                >
                  <td className="px-2 py-1.5 sm:px-3 sm:py-2">
                    <span
                      className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${
                        d.severity === "error"
                          ? "bg-red-500"
                          : d.severity === "warning"
                            ? "bg-amber-500"
                            : "bg-blue-400"
                      }`}
                    />
                    {d.description}
                  </td>
                  <td className="px-2 py-1.5 font-mono sm:px-3 sm:py-2">
                    {d.primaryValue ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 font-mono sm:px-3 sm:py-2">
                    {d.verificationValue ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function UploadReview({
  upload,
  onReprocess,
  onClose,
  onSaved,
}: {
  upload: UploadedStatement;
  onReprocess: () => void;
  onClose: () => void;
  onSaved?: (updated: UploadedStatement) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/upload/${upload.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      // Refresh the upload record to get confirmed_at
      const detailRes = await fetch(`/api/upload/${upload.id}`);
      if (detailRes.ok) {
        const updated = await detailRes.json();
        onSaved?.(updated);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const extraction = upload.extracted_data as PortsieExtraction | null;
  if (!extraction) return null;

  const confidence = CONFIDENCE_STYLES[extraction.confidence];
  const isMultiAccount = extraction.accounts.length > 1;

  // Aggregate stats from per-account data
  const allTransactions = extraction.accounts.flatMap((a) => a.transactions);
  const allPositions = extraction.accounts.flatMap((a) => a.positions);
  const totalBalances = extraction.accounts.reduce((sum, a) => sum + a.balances.length, 0);
  const totalAccounts = extraction.accounts.length;

  const verificationData = upload.verification_data as PortsieExtraction | null;

  return (
    <div className="space-y-4 rounded-lg border bg-white p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="truncate text-base font-semibold sm:text-lg">Upload Data Review: {upload.filename}</h3>
          <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
            {extraction.document.institution_name && (
              <span className="font-medium text-gray-700">{extraction.document.institution_name}</span>
            )}
            {extraction.document.statement_start_date && (
              <span>
                {extraction.document.statement_start_date}
                {extraction.document.statement_end_date &&
                  ` to ${extraction.document.statement_end_date}`}
              </span>
            )}
            {extraction.document.document_type && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">
                {extraction.document.document_type}
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
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Multi-account summary */}
      {isMultiAccount && <AccountsSummary accounts={extraction.accounts} />}

      {/* Single-account info detected */}
      {!isMultiAccount && extraction.accounts[0] && (
        <div className="rounded-md bg-gray-50 p-3 text-sm">
          <span className="font-medium text-gray-700">Detected account: </span>
          <span className="text-gray-600">
            {[
              extraction.accounts[0].account_info.institution_name,
              extraction.accounts[0].account_info.account_type,
              extraction.accounts[0].account_info.account_number
                ? `****${extraction.accounts[0].account_info.account_number.replace(/^\.+/, "").slice(-4)}`
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

      {/* Verification comparison — shown prominently before data tables */}
      {(verificationData || upload.verification_error) && (
        <VerificationSection
          primaryExtraction={extraction}
          verificationData={verificationData}
          verificationError={upload.verification_error}
          verificationSettings={upload.verification_settings}
          processingSettings={upload.processing_settings}
        />
      )}

      {/* Summary counts */}
      <div className="flex flex-wrap gap-2 text-sm sm:gap-4">
        {isMultiAccount && (
          <span className="rounded-md bg-indigo-50 px-3 py-1 text-indigo-700">
            {totalAccounts} account{totalAccounts !== 1 ? "s" : ""}
          </span>
        )}
        <span className="rounded-md bg-blue-50 px-3 py-1 text-blue-700">
          {allTransactions.length} transaction{allTransactions.length !== 1 ? "s" : ""}
        </span>
        <span className="rounded-md bg-purple-50 px-3 py-1 text-purple-700">
          {allPositions.length} position{allPositions.length !== 1 ? "s" : ""}
        </span>
        {extraction.unallocated_positions.length > 0 && (
          <span className="rounded-md bg-orange-50 px-3 py-1 text-orange-700">
            {extraction.unallocated_positions.length} aggregate position
            {extraction.unallocated_positions.length !== 1 ? "s" : ""}
          </span>
        )}
        <span className="rounded-md bg-teal-50 px-3 py-1 text-teal-700">
          {totalBalances} balance snapshot{totalBalances !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Transactions table — all accounts merged */}
      <TransactionsTable transactions={allTransactions} />

      {/* Per-account positions (only if per-account, not unallocated) */}
      {allPositions.length > 0 && (
        <PositionsTable positions={allPositions} title="Positions (Per-Account)" />
      )}

      {/* Unallocated (aggregate) positions */}
      {extraction.unallocated_positions.length > 0 && (
        <PositionsTable
          positions={extraction.unallocated_positions}
          title="Aggregate Positions (Multi-Account)"
        />
      )}

      {/* Balance snapshots (single-account only) */}
      {totalBalances > 0 && !isMultiAccount && extraction.accounts[0] && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">Balance Snapshots</h4>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {extraction.accounts[0].balances.map((b, i) => (
              <div key={i} className="rounded-md border p-3 text-sm">
                <p className="text-xs text-gray-400">{b.snapshot_date}</p>
                {b.liquidation_value != null && (
                  <p>
                    <span className="text-gray-500">Total: </span>
                    <span className="font-medium">{formatCurrency(b.liquidation_value)}</span>
                  </p>
                )}
                {b.cash_balance != null && (
                  <p>
                    <span className="text-gray-500">Cash: </span>
                    {formatCurrency(b.cash_balance)}
                  </p>
                )}
                {b.buying_power != null && (
                  <p>
                    <span className="text-gray-500">Buying power: </span>
                    {formatCurrency(b.buying_power)}
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
            Saved to {isMultiAccount ? `${totalAccounts} accounts` : "account"}
          </span>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Confirm & Save"}
          </button>
        )}
        {saveError && (
          <span className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{saveError}</span>
        )}
        <button
          onClick={onReprocess}
          className="rounded-md border px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Re-extract
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
