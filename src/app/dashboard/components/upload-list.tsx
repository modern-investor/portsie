"use client";

import type { UploadedStatement } from "@/lib/upload/types";

const STATUS_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  pending: { label: "Pending", className: "bg-gray-100 text-gray-600" },
  processing: {
    label: "Processing",
    className: "bg-blue-100 text-blue-700 animate-pulse",
  },
  completed: { label: "Ready to review", className: "bg-green-100 text-green-700" },
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
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadList({
  uploads,
  processingIds,
  onProcess,
  onReview,
  onDelete,
}: {
  uploads: UploadedStatement[];
  processingIds: Set<string>;
  onProcess: (id: string) => void;
  onReview: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (uploads.length === 0) return null;

  return (
    <div className="space-y-2">
      {uploads.map((upload) => {
        const isProcessing =
          processingIds.has(upload.id) ||
          upload.parse_status === "processing";
        const status = isProcessing
          ? STATUS_STYLES.processing
          : STATUS_STYLES[upload.parse_status] ?? STATUS_STYLES.pending;
        const isConfirmed = !!upload.confirmed_at;

        return (
          <div
            key={upload.id}
            className="flex items-center gap-3 rounded-lg border px-4 py-3"
          >
            {/* File type badge */}
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-gray-100 text-xs font-semibold text-gray-500">
              {FILE_TYPE_ICONS[upload.file_type] ?? "?"}
            </span>

            {/* File info */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{upload.filename}</p>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>{formatFileSize(upload.file_size_bytes)}</span>
                {upload.parse_error && (
                  <span
                    className="truncate text-red-500"
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
              {upload.parse_status === "pending" && !isProcessing && (
                <button
                  onClick={() => onProcess(upload.id)}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Process
                </button>
              )}

              {upload.parse_status === "failed" && !isProcessing && (
                <button
                  onClick={() => onProcess(upload.id)}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Retry
                </button>
              )}

              {(upload.parse_status === "completed" ||
                upload.parse_status === "partial") &&
                !isConfirmed && (
                  <button
                    onClick={() => onReview(upload.id)}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                  >
                    Review
                  </button>
                )}

              {!isProcessing && !isConfirmed && (
                <button
                  onClick={() => onDelete(upload.id)}
                  className="rounded-md px-2 py-1.5 text-xs text-gray-400 hover:text-red-600"
                  title="Delete"
                >
                  <svg
                    className="h-4 w-4"
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
