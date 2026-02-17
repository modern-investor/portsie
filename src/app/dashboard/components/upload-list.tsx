"use client";

import { useState, useMemo } from "react";
import type { UploadedStatement } from "@/lib/upload/types";

const STATUS_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  pending: { label: "Pending", className: "bg-gray-100 text-gray-600" },
  queued: { label: "Queued", className: "bg-yellow-100 text-yellow-700" },
  processing: {
    label: "Processing",
    className: "bg-blue-100 text-blue-700 animate-pulse",
  },
  completed: { label: "Extracted", className: "bg-green-100 text-green-700" },
  partial: {
    label: "Partial extraction",
    className: "bg-amber-100 text-amber-700",
  },
  failed: { label: "Failed", className: "bg-red-100 text-red-700" },
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  if (start && end) {
    // Same date = snapshot; different dates = range
    if (start === end) return formatDate(start);
    return `${formatDate(start)} – ${formatDate(end)}`;
  }
  return formatDate(start || end!);
}

/** Describe what kind of data was extracted */
function describeContent(upload: UploadedStatement): string | null {
  const data = upload.extracted_data;
  if (!data) return null;
  const parts: string[] = [];
  if (data.transactions.length > 0)
    parts.push(`${data.transactions.length} transaction${data.transactions.length !== 1 ? "s" : ""}`);
  if (data.positions.length > 0)
    parts.push(`${data.positions.length} position${data.positions.length !== 1 ? "s" : ""}`);
  if (data.balances.length > 0)
    parts.push(`${data.balances.length} balance${data.balances.length !== 1 ? "s" : ""}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function UploadList({
  uploads,
  processingIds,
  queuedIds,
  batchTotal,
  batchDone,
  onBatchProcess,
  onReview,
  onDelete,
}: {
  uploads: UploadedStatement[];
  processingIds: Set<string>;
  queuedIds: Set<string>;
  batchTotal: number;
  batchDone: number;
  onBatchProcess: (ids: string[]) => void;
  onReview: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  // Track IDs the user has explicitly unchecked; everything else defaults to checked
  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());

  // IDs that can be checked for batch processing (pending or failed, not currently processing)
  const processableIds = useMemo(
    () =>
      uploads
        .filter(
          (u) =>
            (u.parse_status === "pending" || u.parse_status === "failed") &&
            !processingIds.has(u.id) &&
            !u.confirmed_at
        )
        .map((u) => u.id),
    [uploads, processingIds]
  );

  // All processable IDs are checked unless explicitly deselected
  const checkedIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of processableIds) {
      if (!deselectedIds.has(id)) set.add(id);
    }
    return set;
  }, [processableIds, deselectedIds]);

  function toggleSelection(id: string) {
    if (checkedIds.has(id)) {
      setDeselectedIds((prev) => new Set(prev).add(id));
    } else {
      setDeselectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function toggleAll() {
    if (checkedIds.size === processableIds.length) {
      // Deselect all
      setDeselectedIds(new Set(processableIds));
    } else {
      // Select all
      setDeselectedIds(new Set());
    }
  }

  function handleBatchProcess() {
    const ids = Array.from(checkedIds);
    if (ids.length > 0) {
      onBatchProcess(ids);
    }
  }

  if (uploads.length === 0) return null;

  const allChecked = processableIds.length > 0 && checkedIds.size === processableIds.length;
  const someChecked = checkedIds.size > 0 && checkedIds.size < processableIds.length;

  return (
    <div className="space-y-2">
      {/* Batch action bar */}
      {processableIds.length > 0 && batchTotal === 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
          <input
            type="checkbox"
            checked={allChecked}
            ref={(el) => {
              if (el) el.indeterminate = someChecked;
            }}
            onChange={toggleAll}
            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 sm:h-4 sm:w-4"
          />
          <span className="text-sm text-gray-600">
            {checkedIds.size} of {processableIds.length} selected
          </span>
          <button
            onClick={handleBatchProcess}
            disabled={checkedIds.size === 0}
            className="ml-auto rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Process{checkedIds.size > 0 ? ` (${checkedIds.size})` : ""}
          </button>
        </div>
      )}

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

      {uploads.map((upload) => {
        const isQueued = queuedIds.has(upload.id);
        const isProcessing =
          processingIds.has(upload.id) ||
          upload.parse_status === "processing";
        const status = isProcessing
          ? STATUS_STYLES.processing
          : isQueued
            ? STATUS_STYLES.queued
            : STATUS_STYLES[upload.parse_status] ?? STATUS_STYLES.pending;
        const isConfirmed = !!upload.confirmed_at;
        const isProcessable = processableIds.includes(upload.id);

        return (
          <div
            key={upload.id}
            className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-3"
          >
            {/* Checkbox for processable files */}
            {isProcessable ? (
              <input
                type="checkbox"
                checked={checkedIds.has(upload.id)}
                onChange={() => toggleSelection(upload.id)}
                className="h-5 w-5 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500 sm:h-4 sm:w-4"
              />
            ) : (
              <div className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" />
            )}

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
                  Uploaded {formatDate(upload.created_at)}
                </span>
                {upload.parse_error && (
                  <span
                    className={`truncate ${isProcessing || isQueued ? "text-gray-300 line-through" : "text-red-500"}`}
                    title={upload.parse_error}
                  >
                    {upload.parse_error}
                  </span>
                )}
              </div>
            </div>

            {/* Status badge */}
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
            >
              {isConfirmed ? "Saved" : status.label}
            </span>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-1">
              {(upload.parse_status === "completed" ||
                upload.parse_status === "partial") && (
                  <button
                    onClick={() => onReview(upload.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                      isConfirmed
                        ? "border text-gray-600 hover:bg-gray-50"
                        : "bg-green-600 text-white hover:bg-green-700"
                    }`}
                  >
                    View
                  </button>
                )}

              {!isProcessing && !isConfirmed && (
                <button
                  onClick={() => onDelete(upload.id)}
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
        );
      })}
    </div>
  );
}
