"use client";

import { useEffect, useState } from "react";
import type { ProcessingLogData, Waypoint } from "@/lib/extraction/processing-log";
import { STEP_LABELS } from "@/lib/extraction/processing-log";

interface DiagnosticRow {
  id: string;
  filename: string;
  file_type: string;
  file_size_bytes: number | null;
  parse_status: string;
  parse_error: string | null;
  processing_log: ProcessingLogData;
  processing_step: string | null;
  processing_settings: {
    preset: string;
    label: string;
    backend: string;
    model: string;
    thinkingLevel: string;
    mediaResolution: string;
  } | null;
  created_at: string;
  updated_at: string;
}

type OutcomeFilter = "all" | "success" | "failed" | "timeout";

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
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

function formatDuration(ms: number | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

const OUTCOME_STYLES: Record<string, { label: string; className: string }> = {
  success: { label: "Success", className: "bg-green-100 text-green-700" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700" },
  timeout: { label: "Timeout", className: "bg-amber-100 text-amber-700" },
  in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-700" },
};

const STEP_STATUS_STYLES: Record<string, string> = {
  completed: "text-green-600",
  failed: "text-red-600",
  running: "text-blue-600",
  skipped: "text-gray-400",
};

function WaypointTimeline({ waypoints }: { waypoints: Waypoint[] }) {
  return (
    <div className="space-y-1">
      {waypoints.map((w, i) => (
        <div
          key={`${w.step}-${i}`}
          className="flex items-start gap-3 text-xs"
        >
          {/* Step indicator */}
          <div className="flex w-5 shrink-0 items-center justify-center pt-0.5">
            {w.status === "completed" && (
              <span className="text-green-500">&#10003;</span>
            )}
            {w.status === "failed" && (
              <span className="text-red-500">&#10007;</span>
            )}
            {w.status === "running" && (
              <span className="text-blue-500">&#9679;</span>
            )}
            {w.status === "skipped" && (
              <span className="text-gray-300">&#8212;</span>
            )}
          </div>

          {/* Step details */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`font-medium ${STEP_STATUS_STYLES[w.status] ?? "text-gray-600"}`}>
                {STEP_LABELS[w.step] ?? w.step}
              </span>
              <span className="text-gray-400">
                {formatDuration(w.durationMs)}
              </span>
            </div>
            {w.detail && (
              <p className="text-gray-500">{w.detail}</p>
            )}
            {w.error && (
              <p className="mt-0.5 rounded bg-red-50 px-1.5 py-0.5 text-red-600">
                {w.error}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminDiagnostics() {
  const [rows, setRows] = useState<DiagnosticRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/admin/diagnostics")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch diagnostics");
        return res.json();
      })
      .then((data: DiagnosticRow[]) => setRows(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter((r) => {
    if (outcomeFilter !== "all" && r.processing_log.outcome !== outcomeFilter) {
      return false;
    }
    if (search && !r.filename.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="rounded-lg border p-4 sm:p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-48 rounded bg-gray-200" />
          <div className="h-12 rounded bg-gray-200" />
          <div className="h-12 rounded bg-gray-200" />
          <div className="h-12 rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4 sm:p-6">
      <div>
        <h3 className="font-medium">Processing Diagnostics</h3>
        <p className="mt-1 text-sm text-gray-500">
          Recent processing logs across all users. Expand a row to see the full
          waypoint timeline.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-md border p-0.5">
          {(["all", "success", "failed", "timeout"] as OutcomeFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setOutcomeFilter(f)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                outcomeFilter === f
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search filename..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-400">
          {filtered.length} of {rows.length} logs
        </span>
      </div>

      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">
          {rows.length === 0
            ? "No processing logs recorded yet."
            : "No logs match the current filter."}
        </p>
      )}

      {/* Log rows */}
      <div className="space-y-2">
        {filtered.map((row) => {
          const log = row.processing_log;
          const isExpanded = expandedId === row.id;
          const outcomeStyle = OUTCOME_STYLES[log.outcome] ?? OUTCOME_STYLES.failed;

          return (
            <div
              key={row.id}
              className={`rounded-md border p-3 transition-colors ${
                log.outcome === "success"
                  ? "border-gray-200"
                  : log.outcome === "timeout"
                    ? "border-amber-200"
                    : "border-red-200"
              }`}
            >
              {/* Row header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-sm font-medium">
                      {row.filename}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${outcomeStyle.className}`}
                    >
                      {outcomeStyle.label}
                    </span>
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                      {row.file_type.toUpperCase()}
                    </span>
                    {log.totalDurationMs != null && (
                      <span className="shrink-0 text-xs text-gray-400">
                        {formatDuration(log.totalDurationMs)}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
                    {log.backend && (
                      <span>
                        {log.backend}
                        {log.model ? ` / ${log.model}` : ""}
                      </span>
                    )}
                    {log.preset && <span>Preset: {log.preset}</span>}
                    {row.file_size_bytes && (
                      <span>{(row.file_size_bytes / 1024).toFixed(1)} KB</span>
                    )}
                    <span>Attempt #{log.attemptNumber}</span>
                  </div>
                  {log.errorMessage && !isExpanded && (
                    <p className="mt-1 truncate text-xs text-red-500" title={log.errorMessage}>
                      {log.errorMessage}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-gray-400">
                  {formatDate(row.updated_at)}
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
                  {/* Waypoint timeline */}
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-gray-600">
                      Waypoint Timeline
                    </p>
                    <WaypointTimeline waypoints={log.waypoints} />
                  </div>

                  {/* Error details */}
                  {log.errorMessage && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-gray-600">
                        Error
                        {log.errorCategory && (
                          <span className="ml-1.5 rounded bg-red-100 px-1.5 py-0.5 font-normal text-red-600">
                            {log.errorCategory}
                          </span>
                        )}
                      </p>
                      <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-700">
                        {log.errorMessage}
                      </pre>
                    </div>
                  )}

                  {/* Parse error from DB */}
                  {row.parse_error && row.parse_error !== log.errorMessage && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-gray-600">
                        DB Parse Error
                      </p>
                      <pre className="max-h-24 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-600">
                        {row.parse_error}
                      </pre>
                    </div>
                  )}

                  {/* Processing settings */}
                  {row.processing_settings && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>Backend: <span className="font-medium">{row.processing_settings.backend}</span></span>
                      <span>Model: <span className="font-medium">{row.processing_settings.model}</span></span>
                      <span>Preset: <span className="font-medium">{row.processing_settings.label}</span></span>
                      <span>Thinking: <span className="font-medium">{row.processing_settings.thinkingLevel}</span></span>
                      <span>Resolution: <span className="font-medium">{row.processing_settings.mediaResolution}</span></span>
                    </div>
                  )}

                  {/* Timing */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>Started: {log.startedAt ? formatDate(log.startedAt) : "—"}</span>
                    <span>Completed: {log.completedAt ? formatDate(log.completedAt) : "—"}</span>
                    <span>Total: {formatDuration(log.totalDurationMs)}</span>
                    <span>Status: {row.parse_status}</span>
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
