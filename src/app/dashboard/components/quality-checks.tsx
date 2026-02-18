"use client";

import { useEffect, useState } from "react";
import type { CheckResult, FixAttempt } from "@/lib/quality-check/types";

interface QCRecord {
  id: string;
  upload_id: string;
  check_status: string;
  checks: CheckResult;
  fix_attempts: FixAttempt[];
  fix_count: number;
  resolved_at: string | null;
  created_at: string;
  upload: { filename: string; file_type: string } | null;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  passed: { label: "Passed", className: "bg-green-100 text-green-700" },
  failed: { label: "Failed", className: "bg-orange-100 text-orange-700" },
  fixed: { label: "Fixed", className: "bg-blue-100 text-blue-700" },
  fixing_prompt: { label: "Fixing...", className: "bg-purple-100 text-purple-700" },
  fixing_code: { label: "Code fix...", className: "bg-purple-100 text-purple-700" },
  running: { label: "Running", className: "bg-purple-100 text-purple-700" },
  unresolved: { label: "Unresolved", className: "bg-red-100 text-red-700" },
};

const SHORT_MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const mon = SHORT_MONTHS[d.getMonth()];
  const yr = String(d.getFullYear()).slice(-2);
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = d.getHours() >= 12 ? "p" : "a";
  return `${day}-${mon}-${yr} ${h}:${m}${ampm}`;
}

function CheckIcon({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="text-green-600" title="Passed">&#10003;</span>
  ) : (
    <span className="text-red-600" title="Failed">&#10007;</span>
  );
}

function formatValue(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

export function QualityChecks({
  onUnresolvedCount,
}: {
  onUnresolvedCount?: (count: number) => void;
}) {
  const [checks, setChecks] = useState<QCRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/quality-checks")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch quality checks");
        return res.json();
      })
      .then((data: QCRecord[]) => {
        setChecks(data);
        onUnresolvedCount?.(
          data.filter((c) => ["failed", "unresolved"].includes(c.check_status)).length
        );
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="rounded-lg border p-4 sm:p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-40 rounded bg-gray-200" />
          <div className="h-12 rounded bg-gray-200" />
          <div className="h-12 rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  // Aggregate summary
  const counts = { passed: 0, failed: 0, fixed: 0, unresolved: 0 };
  for (const c of checks) {
    if (c.check_status === "passed") counts.passed++;
    else if (c.check_status === "fixed") counts.fixed++;
    else if (c.check_status === "unresolved") counts.unresolved++;
    else if (c.check_status === "failed") counts.failed++;
  }

  return (
    <div className="space-y-4 rounded-lg border p-4 sm:p-6">
      <div>
        <h3 className="font-medium">Quality Checks</h3>
        <p className="mt-1 text-sm text-gray-500">
          Automated verification of extracted data after processing. Each check compares
          extracted values against what was written to the database.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Aggregate summary */}
      {checks.length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-green-700">
            {counts.passed} passed
          </span>
          {counts.fixed > 0 && (
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-blue-700">
              {counts.fixed} fixed
            </span>
          )}
          {counts.failed > 0 && (
            <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-orange-700">
              {counts.failed} failed
            </span>
          )}
          {counts.unresolved > 0 && (
            <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-red-700">
              {counts.unresolved} unresolved
            </span>
          )}
        </div>
      )}

      {checks.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">
          No quality checks recorded yet. Quality checks run automatically after
          document processing.
        </p>
      )}

      <div className="space-y-2">
        {checks.map((qc) => {
          const badge = STATUS_BADGE[qc.check_status] ?? STATUS_BADGE.running;
          const isExpanded = expandedId === qc.id;

          return (
            <div
              key={qc.id}
              className={`rounded-md border p-3 transition-colors ${
                qc.check_status === "passed" || qc.check_status === "fixed"
                  ? "border-gray-200 bg-gray-50/50"
                  : "border-orange-200"
              }`}
            >
              {/* Row header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-sm font-medium">
                      {qc.upload?.filename ?? "Unknown file"}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
                    <span>
                      <CheckIcon passed={qc.checks.total_value.passed} /> Value
                    </span>
                    <span>
                      <CheckIcon passed={qc.checks.position_count.passed} /> Positions
                    </span>
                    <span>
                      <CheckIcon passed={qc.checks.transaction_count.passed} /> Transactions
                    </span>
                    {qc.fix_count > 0 && (
                      <span className="text-purple-600">
                        {qc.fix_count} fix attempt{qc.fix_count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-gray-400">
                  {formatDate(qc.created_at)}
                </span>
              </div>

              {/* Summary line */}
              {!qc.checks.overall_passed && (
                <p className="mt-1 truncate text-xs text-orange-600" title={qc.checks.summary}>
                  {qc.checks.summary}
                </p>
              )}

              {/* Expand/collapse */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : qc.id)}
                className="mt-1.5 text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                {isExpanded ? "Collapse" : "Details"}
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="mt-2 space-y-3 border-t pt-3">
                  {/* Individual check results */}
                  <div className="space-y-2">
                    <div className="text-xs">
                      <span className="font-medium text-gray-600">Total Value: </span>
                      <CheckIcon passed={qc.checks.total_value.passed} />{" "}
                      Expected {formatValue(qc.checks.total_value.expected)}, got{" "}
                      {formatValue(qc.checks.total_value.actual)}{" "}
                      <span className="text-gray-400">
                        ({qc.checks.total_value.diff_pct > 0 ? "+" : ""}
                        {qc.checks.total_value.diff_pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="text-xs">
                      <span className="font-medium text-gray-600">Positions: </span>
                      <CheckIcon passed={qc.checks.position_count.passed} />{" "}
                      Expected {qc.checks.position_count.expected}, got{" "}
                      {qc.checks.position_count.actual}
                    </div>
                    <div className="text-xs">
                      <span className="font-medium text-gray-600">Transactions: </span>
                      <CheckIcon passed={qc.checks.transaction_count.passed} />{" "}
                      Expected {qc.checks.transaction_count.expected}, got{" "}
                      {qc.checks.transaction_count.actual}
                    </div>
                    <div className="text-xs">
                      <span className="font-medium text-gray-600">Balance Sanity: </span>
                      <CheckIcon passed={qc.checks.balance_sanity.passed} />{" "}
                      Cash {formatValue(qc.checks.balance_sanity.cash)} + Equity{" "}
                      {formatValue(qc.checks.balance_sanity.equity)} = Total{" "}
                      {formatValue(qc.checks.balance_sanity.total)}{" "}
                      <span className="text-gray-400">
                        (expected {formatValue(qc.checks.balance_sanity.expected_total)})
                      </span>
                    </div>
                    <div className="text-xs">
                      <span className="font-medium text-gray-600">Position Sum: </span>
                      <CheckIcon passed={qc.checks.position_sum.passed} />{" "}
                      Expected {formatValue(qc.checks.position_sum.expected)}, got{" "}
                      {formatValue(qc.checks.position_sum.actual)}{" "}
                      <span className="text-gray-400">
                        ({qc.checks.position_sum.diff_pct > 0 ? "+" : ""}
                        {qc.checks.position_sum.diff_pct.toFixed(1)}%)
                      </span>
                    </div>
                  </div>

                  {/* Fix attempts */}
                  {qc.fix_attempts.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-gray-600">
                        Fix Attempts
                      </p>
                      <div className="space-y-1.5">
                        {qc.fix_attempts.map((attempt, i) => (
                          <div
                            key={i}
                            className={`rounded px-2 py-1.5 text-xs ${
                              attempt.status === "succeeded"
                                ? "bg-green-50 text-green-700"
                                : attempt.status === "failed"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-purple-50 text-purple-700"
                            }`}
                          >
                            <span className="font-medium">Phase {attempt.phase}</span>
                            {" — "}
                            {attempt.status === "succeeded"
                              ? "Fixed successfully"
                              : attempt.status === "failed"
                                ? attempt.error ?? "Failed"
                                : "Running..."}
                            {attempt.started_at && attempt.completed_at && (
                              <span className="text-gray-400">
                                {" ("}
                                {Math.round(
                                  (new Date(attempt.completed_at).getTime() -
                                    new Date(attempt.started_at).getTime()) /
                                    1000
                                )}
                                s)
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
