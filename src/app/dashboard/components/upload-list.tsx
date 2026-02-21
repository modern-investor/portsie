"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { UploadedStatement } from "@/lib/upload/types";
import type { PortsieExtraction } from "@/lib/extraction/schema";
import { UploadReview } from "./upload-review";

const STATUS_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  pending: { label: "Pending", className: "bg-gray-100 text-gray-600" },
  queued: { label: "Queued", className: "bg-yellow-100 text-yellow-700" },
  processing: {
    label: "Processing",
    className: "bg-blue-100 text-blue-700",
  },
  extracted: { label: "Extracted", className: "bg-green-100 text-green-700" },
  completed: { label: "Saved", className: "bg-green-100 text-green-700" },
  partial: {
    label: "Partial extraction",
    className: "bg-amber-100 text-amber-700",
  },
  failed: { label: "Failed", className: "bg-red-100 text-red-700" },
  qc_running: { label: "Verifying...", className: "bg-purple-100 text-purple-700" },
  qc_failed: { label: "Quality issue", className: "bg-orange-100 text-orange-700" },
  qc_fixing: { label: "Auto-fixing...", className: "bg-purple-100 text-purple-700" },
};

const FILE_TYPE_ICONS: Record<string, string> = {
  pdf: "PDF",
  csv: "CSV",
  xlsx: "XLS",
  png: "IMG",
  jpg: "IMG",
  ofx: "OFX",
  qfx: "QFX",
  txt: "TXT",
  json: "JSON",
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Format as DD-Mon-YY, e.g. 01-Jan-25 */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = SHORT_MONTHS[d.getUTCMonth()];
  const yr = String(d.getUTCFullYear()).slice(-2);
  return `${day}-${mon}-${yr}`;
}

function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  if (start && end) {
    if (start === end) return formatDate(start);
    return `${formatDate(start)} to ${formatDate(end)}`;
  }
  return formatDate(start || end!);
}

/** Format an ISO timestamp as h:mm:ssa, e.g. 2:05:30p */
function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ampm = h >= 12 ? "p" : "a";
  h = h % 12 || 12;
  return `${h}:${m}:${s}${ampm}`;
}

/** Describe what kind of data was extracted (compact) */
function describeContent(upload: UploadedStatement): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = upload.extracted_data as any;
  if (!data) return null;
  const parts: string[] = [];
  // Support both PortsieExtraction (accounts[].transactions) and legacy flat arrays
  if (data.accounts && Array.isArray(data.accounts)) {
    const trans = data.accounts.reduce((s: number, a: { transactions?: unknown[] }) => s + (a.transactions?.length ?? 0), 0);
    const pos = data.accounts.reduce((s: number, a: { positions?: unknown[] }) => s + (a.positions?.length ?? 0), 0) + (data.unallocated_positions?.length ?? 0);
    const bal = data.accounts.reduce((s: number, a: { balances?: unknown[] }) => s + (a.balances?.length ?? 0), 0);
    if (trans > 0) parts.push(`${trans} trans`);
    if (pos > 0) parts.push(`${pos} pos`);
    if (bal > 0) parts.push(`${bal} bal`);
  } else {
    if (data.transactions?.length > 0) parts.push(`${data.transactions.length} trans`);
    if (data.positions?.length > 0) parts.push(`${data.positions.length} pos`);
    if (data.balances?.length > 0) parts.push(`${data.balances.length} bal`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Spinner icon for active processing */
function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 16 16"
      fill="none"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.25"
      />
      <path
        d="M14 8a6 6 0 00-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Live elapsed timer that ticks every second */
function ElapsedTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - new Date(since).getTime()) / 1000)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(since).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [since]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const display = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return <span className="tabular-nums">{display}</span>;
}

/** Static elapsed time between two timestamps (no ticking) */
function StaticElapsed({ start, end }: { start: string; end: string }) {
  const secs = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  const display = mins > 0 ? `${mins}m ${rem}s` : `${rem}s`;
  return <span className="tabular-nums">{display}</span>;
}

/** Compact inline summary shown below a completed upload row */
function InlineSummary({ upload }: { upload: UploadedStatement }) {
  const ext = upload.extracted_data as PortsieExtraction | null;
  if (!ext) return null;

  const totalPositions = ext.accounts.reduce((s, a) => s + a.positions.length, 0) + ext.unallocated_positions.length;
  const totalTransactions = ext.accounts.reduce((s, a) => s + a.transactions.length, 0);
  const totalBalances = ext.accounts.reduce((s, a) => s + a.balances.length, 0);

  // Get total value from first account's first balance
  const totalValue = ext.accounts.reduce((sum, a) => {
    const bal = a.balances[0];
    return sum + (bal?.liquidation_value ?? 0);
  }, 0);

  const institutions = [...new Set(ext.accounts.map((a) => a.account_info.institution_name).filter(Boolean))];
  const MAX_INSTITUTIONS = 3;
  const displayInstitutions = institutions.slice(0, MAX_INSTITUTIONS);
  const extraCount = institutions.length - MAX_INSTITUTIONS;

  return (
    <div className="ml-[52px] sm:ml-[56px] -mt-1 mb-1 flex flex-wrap items-center gap-1.5 text-xs">
      {displayInstitutions.length > 0 && (
        <span className="font-medium text-gray-600">
          {displayInstitutions.join(", ")}
          {extraCount > 0 && ` +${extraCount} more`}
        </span>
      )}
      {totalValue > 0 && (
        <span className="rounded bg-green-50 px-1.5 py-0.5 font-medium text-green-700">
          ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )}
      {totalPositions > 0 && (
        <span className="rounded bg-purple-50 px-1.5 py-0.5 text-purple-600">
          {totalPositions} pos
        </span>
      )}
      {totalTransactions > 0 && (
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">
          {totalTransactions} txn
        </span>
      )}
      {totalBalances > 0 && (
        <span className="rounded bg-teal-50 px-1.5 py-0.5 text-teal-600">
          {totalBalances} bal
        </span>
      )}
    </div>
  );
}

export function UploadList({
  uploads,
  processingIds,
  queuedIds,
  batchTotal,
  batchDone,
  timestamps,
  processCount,
  reviewingId,
  onReview,
  onDelete,
  onReprocess,
  onSaved,
  onCloseReview,
}: {
  uploads: UploadedStatement[];
  processingIds: Set<string>;
  queuedIds: Set<string>;
  batchTotal: number;
  batchDone: number;
  timestamps: Record<string, { q?: string; s?: string; e?: string }>;
  processCount: Record<string, number>;
  reviewingId: string | null;
  onReview: (id: string) => void;
  onDelete: (id: string) => void;
  onReprocess: () => void;
  onSaved: (updated: UploadedStatement) => void;
  onCloseReview: () => void;
}) {
  // Ref for scrolling to expanded review
  const reviewRef = useRef<HTMLDivElement>(null);

  // Sort uploads in reverse chronological order
  const sortedUploads = useMemo(
    () => [...uploads].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [uploads]
  );

  // Scroll to expanded review when reviewingId changes
  useEffect(() => {
    if (reviewingId && reviewRef.current) {
      requestAnimationFrame(() => {
        reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [reviewingId]);

  if (uploads.length === 0) return null;

  const reviewingUpload = reviewingId
    ? uploads.find((u) => u.id === reviewingId) ?? null
    : null;

  return (
    <div className="space-y-2">
      {/* Batch progress bar */}
      {batchTotal > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-blue-800">
              Processing {batchDone + 1} of {batchTotal}
            </span>
            <span className="text-blue-600">
              {batchDone} done
              {batchTotal - batchDone - 1 > 0 && `, ${batchTotal - batchDone - 1} queued`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-blue-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
              style={{ width: `${(batchDone / batchTotal) * 100}%` }}
            />
          </div>
        </div>
      )}

      {sortedUploads.map((upload) => {
        const isQueued = queuedIds.has(upload.id);
        const ts = timestamps[upload.id];
        const hasEnded = !!ts?.e;
        // Only show live "Processing" spinner if THIS client session initiated it
        const isActivelyProcessing = processingIds.has(upload.id);
        const isLiveProcessing = isActivelyProcessing && !hasEnded;
        // Determine display status
        const status = isLiveProcessing
          ? STATUS_STYLES.processing
          : isQueued
            ? STATUS_STYLES.queued
            : STATUS_STYLES[upload.parse_status] ?? STATUS_STYLES.pending;
        const isConfirmed = !!upload.confirmed_at;
        const isExpanded = reviewingId === upload.id;
        const hasReview = upload.parse_status === "extracted" || upload.parse_status === "completed" || upload.parse_status === "partial" || upload.parse_status === "qc_failed";
        const isQCActive = upload.parse_status === "qc_running" || upload.parse_status === "qc_fixing";

        return (
          <div key={upload.id} id={`upload-${upload.id}`}>
            <div
              className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-3 ${
                hasReview ? "cursor-pointer hover:border-gray-300" : ""
              } ${isExpanded ? "border-gray-400 bg-gray-50/50" : ""}`}
              onClick={hasReview ? () => onReview(isExpanded ? "" : upload.id) : undefined}
            >
              {/* File type badge */}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-gray-100 text-xs font-semibold text-gray-500">
                {FILE_TYPE_ICONS[upload.file_type] ?? "?"}
              </span>

              {/* File info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{upload.filename}</p>
                <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-gray-400">
                  {upload.detected_account_info?.institution_name && (
                    <>
                      <span className="font-medium text-gray-600">
                        {upload.detected_account_info.institution_name}
                      </span>
                      <span aria-hidden>&middot;</span>
                    </>
                  )}
                  {upload.detected_account_info?.account_type && (
                    <>
                      <span>{upload.detected_account_info.account_type}</span>
                      <span aria-hidden>&middot;</span>
                    </>
                  )}
                  {(() => {
                    const range = formatDateRange(upload.statement_start_date, upload.statement_end_date);
                    return range ? (
                      <>
                        <span>{range}</span>
                        <span aria-hidden>&middot;</span>
                      </>
                    ) : null;
                  })()}
                  {(() => {
                    const content = describeContent(upload);
                    return content ? (
                      <>
                        <span>{content}</span>
                        <span aria-hidden>&middot;</span>
                      </>
                    ) : null;
                  })()}
                  <span>{formatFileSize(upload.file_size_bytes)}</span>
                  <span aria-hidden>&middot;</span>
                  <span title={upload.created_at}>
                    &#x2191;{formatDate(upload.created_at)}
                  </span>
                  {upload.parse_error && (
                    <span
                      className={`truncate ${isLiveProcessing || isQueued ? "text-gray-300 line-through" : "text-red-500"}`}
                      title={upload.parse_error}
                    >
                      {upload.parse_error}
                    </span>
                  )}
                  {upload.qc_status_message && (
                    <span
                      className={`truncate ${
                        isQCActive ? "text-purple-600" : "text-orange-600"
                      }`}
                      title={upload.qc_status_message}
                    >
                      {upload.qc_status_message}
                    </span>
                  )}
                </div>
                {/* Processing settings — 3rd line */}
                {upload.processing_settings && (
                  <div className="text-xs font-mono text-gray-400">
                    Processing model: {upload.processing_settings.model}
                    {" · "}
                    {upload.processing_settings.thinkingLevel} thinking
                    {" · "}
                    {upload.processing_settings.mediaResolution === "MEDIA_RESOLUTION_HIGH" ? "high res" : "default res"}
                  </div>
                )}
                {/* Processing timestamps — 4th line */}
                {(() => {
                  const ts = timestamps[upload.id];
                  if (!ts) return null;
                  const parts: string[] = [];
                  if (ts.q) parts.push(`queued:${formatTime(ts.q)}`);
                  if (ts.s) parts.push(`started:${formatTime(ts.s)}`);
                  if (ts.e) parts.push(`completed:${formatTime(ts.e)}`);
                  if (parts.length === 0) return null;
                  const count = processCount[upload.id] ?? 0;
                  return (
                    <div className="text-xs font-mono text-blue-500">
                      {count >= 2 && <span className="font-semibold">#{count} </span>}
                      {parts.join(" ")}
                    </div>
                  );
                })()}
              </div>

              {/* Status badge */}
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
              >
                {(isLiveProcessing || isQCActive) && <Spinner className="h-3 w-3" />}
                {isConfirmed ? "Saved" : status.label}
                {isLiveProcessing && ts?.s && (
                  <ElapsedTimer since={ts.s} />
                )}
                {hasEnded && ts?.s && (
                  <StaticElapsed start={ts.s} end={ts.e!} />
                )}
              </span>

              {/* Actions — fixed width to prevent layout shift */}
              <div className="flex shrink-0 items-center justify-end gap-1 w-[120px]">
                {hasReview && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReview(isExpanded ? "" : upload.id);
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                      isExpanded
                        ? "bg-gray-200 text-gray-700"
                        : isConfirmed
                          ? "border text-gray-600 hover:bg-gray-50"
                          : "bg-green-600 text-white hover:bg-green-700"
                    }`}
                  >
                    {isExpanded ? "Hide" : "View"}
                  </button>
                )}

                {!isLiveProcessing && !isConfirmed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(upload.id);
                    }}
                    className="rounded-md p-2.5 text-xs text-gray-400 hover:text-red-600 sm:px-2 sm:py-1.5"
                    title="Delete"
                  >
                    <svg
                      className="h-5 w-5 sm:h-4 sm:w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Compact inline data summary (when not expanded into full review) */}
            {!isExpanded && hasReview && <InlineSummary upload={upload} />}

            {/* Inline review panel */}
            {isExpanded && reviewingUpload && (
              <div ref={reviewRef} className="mt-1">
                <UploadReview
                  upload={reviewingUpload}
                  onReprocess={onReprocess}
                  onClose={onCloseReview}
                  onSaved={onSaved}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
