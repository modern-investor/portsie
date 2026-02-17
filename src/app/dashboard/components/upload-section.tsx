"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { UploadDropzone } from "./upload-dropzone";
import { UploadList } from "./upload-list";
import { UploadReview } from "./upload-review";
import type { UploadedStatement } from "@/lib/upload/types";

export function UploadSection() {
  const [uploads, setUploads] = useState<UploadedStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  // Timestamps: q = queued, s = processing started, e = ended
  const [timestamps, setTimestamps] = useState<Record<string, { q?: string; s?: string; e?: string }>>({});
  // Track how many times each upload has been processed this session
  const [processCount, setProcessCount] = useState<Record<string, number>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const router = useRouter();

  // Auto-redirect countdown after save
  useEffect(() => {
    if (redirectCountdown === null) return;
    if (redirectCountdown <= 0) {
      router.push("/dashboard");
      return;
    }
    const timer = setTimeout(() => {
      setRedirectCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [redirectCountdown, router]);

  function cancelRedirect() {
    setRedirectCountdown(null);
  }

  // Fetch existing uploads on mount
  const fetchUploads = useCallback(async () => {
    try {
      const res = await fetch("/api/upload");
      if (res.ok) {
        const data = await res.json();
        setUploads(data);
      }
    } catch {
      // Silently fail — user can still upload new files
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  // Handle new file uploaded
  function handleFileUploaded(statement: UploadedStatement) {
    setUploads((prev) => [statement, ...prev]);
  }

  // Trigger LLM processing for a single upload (auto-links account and saves data)
  async function handleProcess(uploadId: string) {
    setProcessingIds((prev) => new Set(prev).add(uploadId));
    setProcessCount((prev) => ({ ...prev, [uploadId]: (prev[uploadId] ?? 0) + 1 }));
    // Record processing start timestamp (keep existing q timestamp)
    setTimestamps((prev) => ({
      ...prev,
      [uploadId]: { ...prev[uploadId], s: new Date().toISOString() },
    }));

    try {
      await fetch(`/api/upload/${uploadId}/process`, { method: "POST" });
    } catch {
      // Error status will be reflected in the refreshed upload record
    } finally {
      // Record end timestamp
      setTimestamps((prev) => ({
        ...prev,
        [uploadId]: { ...prev[uploadId], e: new Date().toISOString() },
      }));
      // Always refresh the upload record to get latest status
      try {
        const detailRes = await fetch(`/api/upload/${uploadId}`);
        if (detailRes.ok) {
          const updated = await detailRes.json();
          setUploads((prev) =>
            prev.map((u) => (u.id === uploadId ? updated : u))
          );
        }
      } catch {
        // Silently fail — user can refresh manually
      }
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(uploadId);
        return next;
      });
    }
  }

  // Batch process: fire all concurrently — server queues and runs up to 3 at a time
  function handleBatchProcess(ids: string[]) {
    const now = new Date().toISOString();
    setQueuedIds(new Set(ids));
    setBatchTotal(ids.length);
    setBatchDone(0);
    // Record queue timestamp for all items
    setTimestamps((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = { q: now };
      return next;
    });

    for (const id of ids) {
      setQueuedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      handleProcess(id).then(() => {
        setBatchDone((prev) => {
          const next = prev + 1;
          // Clear batch state when all done
          if (next >= ids.length) {
            setQueuedIds(new Set());
            setBatchTotal(0);
            return 0;
          }
          return next;
        });
      });
    }
  }

  // Open review panel and scroll to it
  function handleReview(uploadId: string) {
    setReviewingId(uploadId);
    // Scroll after React renders the review section
    requestAnimationFrame(() => {
      reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // Delete an upload
  async function handleDelete(uploadId: string) {
    const res = await fetch(`/api/upload/${uploadId}`, { method: "DELETE" });
    if (res.ok) {
      setUploads((prev) => prev.filter((u) => u.id !== uploadId));
      if (reviewingId === uploadId) setReviewingId(null);
    }
  }

  // Re-process a file
  async function handleReprocess() {
    if (reviewingId) {
      const now = new Date().toISOString();
      setTimestamps((prev) => ({
        ...prev,
        [reviewingId]: { q: now },
      }));
      setReviewingId(null);
      await handleProcess(reviewingId);
    }
  }

  const reviewingUpload = reviewingId
    ? uploads.find((u) => u.id === reviewingId)
    : null;

  return (
    <div className="space-y-4">
      {/* Auto-redirect banner */}
      {redirectCountdown !== null && (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <span className="text-sm font-medium text-green-800">
            Processing complete.
            <br />
            Switching to Analysis Dashboard in {redirectCountdown}s...
          </span>
          <button
            onClick={cancelRedirect}
            className="rounded-md border border-green-300 bg-white px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
          >
            Cancel
          </button>
        </div>
      )}

      <h2 className="text-lg font-semibold">Upload Statements</h2>

      <UploadDropzone onUploaded={handleFileUploaded} onBatchComplete={handleBatchProcess} />

      {loading ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-400">Loading uploads...</p>
          {[1, 2].map((i) => (
            <div
              key={i}
              className="flex h-16 items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 animate-pulse"
            >
              <div className="h-4 w-4 rounded bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-40 rounded bg-gray-200" />
                <div className="h-3 w-24 rounded bg-gray-200" />
              </div>
              <div className="h-6 w-16 rounded-full bg-gray-200" />
            </div>
          ))}
        </div>
      ) : (
        <UploadList
          uploads={uploads}
          processingIds={processingIds}
          queuedIds={queuedIds}
          batchTotal={batchTotal}
          batchDone={batchDone}
          timestamps={timestamps}
          processCount={processCount}
          onBatchProcess={handleBatchProcess}
          onReview={handleReview}
          onDelete={handleDelete}
        />
      )}

      {reviewingUpload && (
        <div ref={reviewRef}>
          <UploadReview
            upload={reviewingUpload}
            onReprocess={handleReprocess}
            onClose={() => setReviewingId(null)}
            onSaved={(updated) => {
              setUploads((prev) =>
                prev.map((u) => (u.id === updated.id ? updated : u))
              );
              setRedirectCountdown(3);
            }}
          />
        </div>
      )}
    </div>
  );
}
