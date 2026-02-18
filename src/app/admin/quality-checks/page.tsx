"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CheckResult, FixAttempt } from "@/lib/quality-check/types";

interface AdminQCRecord {
  id: string;
  user_id: string;
  user_email: string;
  upload_id: string;
  check_status: string;
  checks: CheckResult;
  fix_attempts: FixAttempt[];
  fix_count: number;
  resolved_at: string | null;
  created_at: string;
  upload: { filename: string; file_type: string } | null;
}

interface AdminQCStats {
  total: number;
  passed: number;
  failed: number;
  fixed: number;
  unresolved: number;
  fixing: number;
}

interface AdminQCResponse {
  checks: AdminQCRecord[];
  stats: AdminQCStats;
  total: number;
  limit: number;
  offset: number;
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

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "fixed", label: "Fixed" },
  { value: "unresolved", label: "Unresolved" },
];

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

function formatValue(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

function CheckIcon({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="text-green-600">&#10003;</span>
  ) : (
    <span className="text-red-600">&#10007;</span>
  );
}

export default function AdminQualityChecksPage() {
  const [data, setData] = useState<AdminQCResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (statusFilter !== "all") params.set("status", statusFilter);

    fetch(`/api/admin/quality-checks?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Quality Checks</h1>
        <Link
          href="/admin"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Admin
        </Link>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {data?.stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-lg border p-3 text-center">
            <p className="text-2xl font-bold">{data.stats.total}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
            <p className="text-2xl font-bold text-green-700">{data.stats.passed}</p>
            <p className="text-xs text-green-600">Passed</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{data.stats.fixed}</p>
            <p className="text-xs text-blue-600">Fixed</p>
          </div>
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-center">
            <p className="text-2xl font-bold text-orange-700">{data.stats.failed}</p>
            <p className="text-xs text-orange-600">Failed</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
            <p className="text-2xl font-bold text-red-700">{data.stats.unresolved}</p>
            <p className="text-xs text-red-600">Unresolved</p>
          </div>
        </div>
      )}

      {/* Pass rate */}
      {data?.stats && data.stats.total > 0 && (
        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
          <span>
            First-pass rate:{" "}
            <span className="font-medium">
              {((data.stats.passed / data.stats.total) * 100).toFixed(0)}%
            </span>
          </span>
          {data.stats.fixed + data.stats.failed + data.stats.unresolved > 0 && (
            <span>
              Auto-fix rate:{" "}
              <span className="font-medium">
                {data.stats.fixed > 0
                  ? (
                      (data.stats.fixed /
                        (data.stats.fixed + data.stats.failed + data.stats.unresolved)) *
                      100
                    ).toFixed(0)
                  : 0}
                %
              </span>
            </span>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === f.value
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {data?.checks.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400">
              No quality checks found.
            </p>
          )}

          {data?.checks.map((qc) => {
            const badge = STATUS_BADGE[qc.check_status] ?? STATUS_BADGE.running;
            const isExpanded = expandedId === qc.id;

            return (
              <div
                key={qc.id}
                className="rounded-lg border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate text-sm font-medium">
                        {qc.upload?.filename ?? "Unknown"}
                      </span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                        {qc.upload?.file_type?.toUpperCase() ?? "?"}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
                      <span>{qc.user_email}</span>
                      <span>
                        <CheckIcon passed={qc.checks.total_value.passed} /> Value
                      </span>
                      <span>
                        <CheckIcon passed={qc.checks.position_count.passed} /> Pos
                      </span>
                      <span>
                        <CheckIcon passed={qc.checks.transaction_count.passed} /> Txn
                      </span>
                      {qc.fix_count > 0 && (
                        <span className="text-purple-600">
                          {qc.fix_count} fix{qc.fix_count !== 1 ? "es" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">
                    {formatDate(qc.created_at)}
                  </span>
                </div>

                {!qc.checks.overall_passed && (
                  <p className="mt-1 truncate text-xs text-orange-600">
                    {qc.checks.summary}
                  </p>
                )}

                <button
                  onClick={() => setExpandedId(isExpanded ? null : qc.id)}
                  className="mt-1.5 text-xs font-medium text-blue-600 hover:text-blue-800"
                >
                  {isExpanded ? "Collapse" : "Details"}
                </button>

                {isExpanded && (
                  <div className="mt-2 space-y-3 border-t pt-3">
                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                      <div>
                        <span className="font-medium text-gray-600">Total Value: </span>
                        <CheckIcon passed={qc.checks.total_value.passed} />{" "}
                        {formatValue(qc.checks.total_value.expected)} vs{" "}
                        {formatValue(qc.checks.total_value.actual)}{" "}
                        <span className="text-gray-400">
                          ({qc.checks.total_value.diff_pct > 0 ? "+" : ""}
                          {qc.checks.total_value.diff_pct.toFixed(1)}%)
                        </span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Positions: </span>
                        <CheckIcon passed={qc.checks.position_count.passed} />{" "}
                        {qc.checks.position_count.expected} vs {qc.checks.position_count.actual}
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Transactions: </span>
                        <CheckIcon passed={qc.checks.transaction_count.passed} />{" "}
                        {qc.checks.transaction_count.expected} vs {qc.checks.transaction_count.actual}
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Balance: </span>
                        <CheckIcon passed={qc.checks.balance_sanity.passed} />{" "}
                        Cash {formatValue(qc.checks.balance_sanity.cash)} + Equity{" "}
                        {formatValue(qc.checks.balance_sanity.equity)}
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Pos Sum: </span>
                        <CheckIcon passed={qc.checks.position_sum.passed} />{" "}
                        {formatValue(qc.checks.position_sum.expected)} vs{" "}
                        {formatValue(qc.checks.position_sum.actual)}
                      </div>
                    </div>

                    {qc.fix_attempts.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-medium text-gray-600">Fix Attempts</p>
                        {qc.fix_attempts.map((attempt, i) => (
                          <div
                            key={i}
                            className={`rounded px-2 py-1 text-xs ${
                              attempt.status === "succeeded"
                                ? "bg-green-50 text-green-700"
                                : attempt.status === "failed"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-purple-50 text-purple-700"
                            }`}
                          >
                            Phase {attempt.phase} — {attempt.status}
                            {attempt.error && `: ${attempt.error}`}
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
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
