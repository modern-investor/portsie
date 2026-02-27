"use client";

import { useEffect, useState } from "react";
import { STEP_LABELS } from "@/lib/extraction/processing-log";

interface TimingBreakdown {
  [key: string]: number | null;
}

interface AnalysisRow {
  id: string;
  upload_id: string | null;
  extraction_failure_id: string | null;
  root_cause: string;
  affected_step: string | null;
  timing_breakdown: TimingBreakdown | null;
  recommended_fix: string | null;
  severity: "low" | "medium" | "high" | "critical";
  analysis_model: string | null;
  analysis_duration_ms: number | null;
  filename: string | null;
  file_size_bytes: number | null;
  processing_settings: {
    preset?: string;
    backend?: string;
    model?: string;
  } | null;
  processing_log: {
    outcome?: string;
    totalDurationMs?: number;
    waypoints?: { step: string; status: string; durationMs?: number; error?: string }[];
  } | null;
  created_at: string;
}

type SeverityFilter = "all" | "critical" | "high" | "medium" | "low";

const SEVERITY_STYLES: Record<string, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-red-100 text-red-700" },
  high: { label: "High", className: "bg-orange-100 text-orange-700" },
  medium: { label: "Medium", className: "bg-amber-100 text-amber-700" },
  low: { label: "Low", className: "bg-green-100 text-green-700" },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const day = String(d.getDate()).padStart(2, "0");
  const mon = months[d.getMonth()];
  const yr = String(d.getFullYear()).slice(-2);
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = d.getHours() >= 12 ? "p" : "a";
  return `${day}-${mon}-${yr} ${h}:${m}${ampm}`;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function TimingBar({ breakdown }: { breakdown: TimingBreakdown }) {
  const entries = Object.entries(breakdown).filter(
    ([, v]) => v != null && v > 0
  ) as [string, number][];
  if (entries.length === 0) return null;

  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  const colors = [
    "bg-blue-400", "bg-green-400", "bg-amber-400",
    "bg-purple-400", "bg-pink-400", "bg-cyan-400",
  ];

  return (
    <div className="space-y-1.5">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
        {entries.map(([key, val], i) => (
          <div
            key={key}
            className={`${colors[i % colors.length]} transition-all`}
            style={{ width: `${(val / total) * 100}%` }}
            title={`${key}: ${formatDuration(val)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {entries.map(([key, val], i) => (
          <span key={key} className="flex items-center gap-1 text-xs text-gray-500">
            <span className={`inline-block h-2 w-2 rounded-full ${colors[i % colors.length]}`} />
            {STEP_LABELS[key] ?? key}: {formatDuration(val)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function FailureAnalyses() {
  const [rows, setRows] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

  useEffect(() => {
    fetch("/api/settings/diagnostics")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch failure analyses");
        return res.json();
      })
      .then((data: AnalysisRow[]) => setRows(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((r) => {
    if (severityFilter !== "all" && r.severity !== severityFilter) return false;
    return true;
  });

  // Summary stats
  const last30Days = rows.filter(
    (r) => new Date(r.created_at) > new Date(Date.now() - 30 * 86400_000)
  );
  const criticalCount = last30Days.filter((r) => r.severity === "critical").length;
  const highCount = last30Days.filter((r) => r.severity === "high").length;

  if (loading) {
    return (
      <div className="rounded-lg border p-4 sm:p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-56 rounded bg-gray-200" />
          <div className="h-20 rounded bg-gray-200" />
          <div className="h-20 rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4 sm:p-6">
      <div>
        <h3 className="font-medium">Failure Analyses</h3>
        <p className="mt-1 text-sm text-gray-500">
          Automated root-cause analyses of extraction failures, generated by Claude Code.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary stats */}
      {last30Days.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="rounded-md border bg-gray-50 px-3 py-2">
            <div className="text-lg font-semibold">{last30Days.length}</div>
            <div className="text-xs text-gray-500">Analyses (30d)</div>
          </div>
          {criticalCount > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <div className="text-lg font-semibold text-red-700">{criticalCount}</div>
              <div className="text-xs text-red-600">Critical</div>
            </div>
          )}
          {highCount > 0 && (
            <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2">
              <div className="text-lg font-semibold text-orange-700">{highCount}</div>
              <div className="text-xs text-orange-600">High</div>
            </div>
          )}
        </div>
      )}

      {/* Severity filter */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 rounded-md border p-0.5">
          {(["all", "critical", "high", "medium", "low"] as SeverityFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setSeverityFilter(f)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                severityFilter === f
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">
          {filtered.length} of {rows.length} analyses
        </span>
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">
          {rows.length === 0
            ? "No failure analyses yet. They are generated automatically when extractions fail."
            : "No analyses match the current filter."}
        </p>
      )}

      {/* Analysis cards */}
      <div className="space-y-2">
        {filtered.map((row) => {
          const isExpanded = expandedId === row.id;
          const sevStyle = SEVERITY_STYLES[row.severity] ?? SEVERITY_STYLES.medium;

          return (
            <div
              key={row.id}
              className={`rounded-md border p-3 transition-colors ${
                row.severity === "critical"
                  ? "border-red-200"
                  : row.severity === "high"
                    ? "border-orange-200"
                    : "border-gray-200"
              }`}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-sm font-medium">
                      {row.filename ?? "Unknown file"}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${sevStyle.className}`}
                    >
                      {sevStyle.label}
                    </span>
                    {row.affected_step && (
                      <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                        {STEP_LABELS[row.affected_step] ?? row.affected_step}
                      </span>
                    )}
                    {row.file_size_bytes && (
                      <span className="shrink-0 text-xs text-gray-400">
                        {formatBytes(row.file_size_bytes)}
                      </span>
                    )}
                  </div>
                  <p className={`mt-1 text-sm text-gray-700 ${isExpanded ? "" : "line-clamp-2"}`}>
                    {row.root_cause}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-gray-400">
                  {formatDate(row.created_at)}
                </span>
              </div>

              {/* Expand/collapse */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : row.id)}
                className="mt-1.5 text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                {isExpanded ? "Collapse" : "Details"}
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="mt-2 space-y-3 border-t pt-3">
                  {/* Root cause (full) */}
                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-600">Root Cause</p>
                    <p className="text-sm text-gray-700">{row.root_cause}</p>
                  </div>

                  {/* Recommended fix */}
                  {row.recommended_fix && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-gray-600">Recommended Fix</p>
                      <p className="rounded bg-blue-50 px-3 py-2 text-sm text-blue-800">
                        {row.recommended_fix}
                      </p>
                    </div>
                  )}

                  {/* Timing breakdown */}
                  {row.timing_breakdown && Object.keys(row.timing_breakdown).length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-gray-600">
                        Timing Breakdown
                      </p>
                      <TimingBar breakdown={row.timing_breakdown} />
                    </div>
                  )}

                  {/* Processing log waypoints */}
                  {row.processing_log?.waypoints && row.processing_log.waypoints.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-gray-600">
                        Pipeline Steps
                      </p>
                      <div className="space-y-1">
                        {row.processing_log.waypoints.map((w, i) => (
                          <div key={`${w.step}-${i}`} className="flex items-center gap-2 text-xs">
                            <span className="w-4 text-center">
                              {w.status === "completed" ? (
                                <span className="text-green-500">&#10003;</span>
                              ) : w.status === "failed" ? (
                                <span className="text-red-500">&#10007;</span>
                              ) : (
                                <span className="text-gray-300">&#8212;</span>
                              )}
                            </span>
                            <span className={`font-medium ${w.status === "failed" ? "text-red-600" : "text-gray-600"}`}>
                              {STEP_LABELS[w.step] ?? w.step}
                            </span>
                            <span className="text-gray-400">{formatDuration(w.durationMs)}</span>
                            {w.error && (
                              <span className="truncate text-red-500" title={w.error}>{w.error}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Metadata row */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    {row.analysis_model && (
                      <span>Model: <span className="font-medium">{row.analysis_model}</span></span>
                    )}
                    {row.analysis_duration_ms != null && (
                      <span>Analysis took: <span className="font-medium">{formatDuration(row.analysis_duration_ms)}</span></span>
                    )}
                    {row.processing_settings?.backend && (
                      <span>Backend: <span className="font-medium">{row.processing_settings.backend}</span></span>
                    )}
                    {row.processing_settings?.model && (
                      <span>Extraction model: <span className="font-medium">{row.processing_settings.model}</span></span>
                    )}
                    {row.processing_log?.totalDurationMs != null && (
                      <span>Processing time: <span className="font-medium">{formatDuration(row.processing_log.totalDurationMs)}</span></span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
