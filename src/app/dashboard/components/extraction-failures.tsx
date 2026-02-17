"use client";

import { useEffect, useState } from "react";

interface FailureSummary {
  id: string;
  filename: string;
  file_type: string;
  attempt_number: number;
  error_message: string;
  created_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  upload_id: string;
}

interface FailureDetail extends FailureSummary {
  file_path: string;
  raw_llm_response: unknown;
  llm_mode: string | null;
  file_size_bytes: number | null;
}

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

export function ExtractionFailures({
  onUnresolvedCount,
}: {
  onUnresolvedCount?: (count: number) => void;
}) {
  const [failures, setFailures] = useState<FailureSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Expanded detail state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, FailureDetail>>({});
  const [detailLoading, setDetailLoading] = useState(false);

  // Resolve form state
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/failures")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch failures");
        return res.json();
      })
      .then((data: FailureSummary[]) => {
        setFailures(data);
        onUnresolvedCount?.(data.filter((f) => !f.resolved_at).length);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);

    // Fetch detail if not cached
    if (!detailCache[id]) {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/settings/failures?id=${id}`);
        if (res.ok) {
          const detail = await res.json();
          setDetailCache((prev) => ({ ...prev, [id]: detail }));
        }
      } catch {
        // silently fail — user can retry
      } finally {
        setDetailLoading(false);
      }
    }
  }

  async function handleResolve(id: string) {
    setResolving(true);
    try {
      const res = await fetch("/api/settings/failures", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, resolution_notes: resolutionNotes || null }),
      });
      if (!res.ok) throw new Error("Failed to resolve");

      // Update local state
      const now = new Date().toISOString();
      setFailures((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, resolved_at: now, resolution_notes: resolutionNotes || null }
            : f
        )
      );
      const updatedUnresolved = failures.filter(
        (f) => f.id !== id && !f.resolved_at
      ).length;
      onUnresolvedCount?.(updatedUnresolved);
      setResolvingId(null);
      setResolutionNotes("");
    } catch {
      // silently fail
    } finally {
      setResolving(false);
    }
  }

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

  return (
    <div className="space-y-4 rounded-lg border p-4 sm:p-6">
      <div>
        <h3 className="font-medium">Extraction Failures</h3>
        <p className="mt-1 text-sm text-gray-500">
          Logged automatically when a 2nd+ processing attempt fails. Use these
          records to diagnose and fix extraction issues.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {failures.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">
          No extraction failures recorded.
        </p>
      )}

      <div className="space-y-2">
        {failures.map((f) => {
          const isExpanded = expandedId === f.id;
          const detail = detailCache[f.id];

          return (
            <div
              key={f.id}
              className={`rounded-md border p-3 transition-colors ${
                f.resolved_at ? "border-gray-200 bg-gray-50/50" : "border-red-200"
              }`}
            >
              {/* Row header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-sm font-medium">
                      {f.filename}
                    </span>
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                      Attempt #{f.attempt_number}
                    </span>
                    {f.resolved_at ? (
                      <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Resolved
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Open
                      </span>
                    )}
                  </div>
                  <p
                    className="mt-1 truncate text-xs text-red-500"
                    title={f.error_message}
                  >
                    {f.error_message}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-gray-400">
                  {formatDate(f.created_at)}
                </span>
              </div>

              {/* Expand/collapse */}
              <button
                onClick={() => toggleExpand(f.id)}
                className="mt-1.5 text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                {isExpanded ? "Collapse" : "Details"}
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="mt-2 space-y-3 border-t pt-3">
                  {detailLoading && !detail ? (
                    <div className="animate-pulse">
                      <div className="h-20 rounded bg-gray-200" />
                    </div>
                  ) : detail ? (
                    <>
                      {/* Diagnostic context */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        {detail.llm_mode && (
                          <span>
                            Mode: <span className="font-medium">{detail.llm_mode}</span>
                          </span>
                        )}
                        {detail.file_size_bytes && (
                          <span>
                            Size:{" "}
                            <span className="font-medium">
                              {(detail.file_size_bytes / 1024).toFixed(1)} KB
                            </span>
                          </span>
                        )}
                        <span>
                          Type: <span className="font-medium">{detail.file_type}</span>
                        </span>
                      </div>

                      {/* Full error */}
                      <div>
                        <p className="mb-1 text-xs font-medium text-gray-600">
                          Error Message
                        </p>
                        <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-700">
                          {detail.error_message}
                        </pre>
                      </div>

                      {/* Raw LLM response */}
                      {detail.raw_llm_response && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-gray-600">
                            Raw LLM Response
                          </p>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-600">
                            {JSON.stringify(detail.raw_llm_response, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* Resolution notes if resolved */}
                      {f.resolved_at && f.resolution_notes && (
                        <div className="rounded bg-green-50 p-2">
                          <p className="text-xs font-medium text-green-700">
                            Resolution
                          </p>
                          <p className="mt-0.5 text-xs text-green-600">
                            {f.resolution_notes}
                          </p>
                        </div>
                      )}

                      {/* Mark Resolved UI */}
                      {!f.resolved_at && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          {resolvingId === f.id ? (
                            <>
                              <input
                                type="text"
                                placeholder="Resolution notes (optional)"
                                value={resolutionNotes}
                                onChange={(e) => setResolutionNotes(e.target.value)}
                                className="flex-1 rounded-md border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => handleResolve(f.id)}
                                  disabled={resolving}
                                  className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                                >
                                  {resolving ? "Saving..." : "Confirm"}
                                </button>
                                <button
                                  onClick={() => {
                                    setResolvingId(null);
                                    setResolutionNotes("");
                                  }}
                                  className="rounded-md border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </>
                          ) : (
                            <button
                              onClick={() => setResolvingId(f.id)}
                              className="rounded-md border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
                            >
                              Mark Resolved
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
