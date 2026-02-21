"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { UploadDropzone } from "./upload-dropzone";
import { UploadList } from "./upload-list";
import { ProcessingPresetSelect } from "./processing-preset-select";
import { VerificationSelect } from "./verification-select";
import type { UploadedStatement } from "@/lib/upload/types";
import type { PortsieExtraction } from "@/lib/extraction/schema";
import { DEFAULT_PRESET } from "@/lib/llm/types";
import type { ProcessingPreset } from "@/lib/llm/types";

const QC_POLL_STATUSES = new Set(["qc_running", "qc_fixing"]);

/** Build a human-readable summary of what was saved */
function buildSavedSummary(uploads: UploadedStatement[], confirmedIds: string[]) {
  const confirmed = uploads.filter((u) => confirmedIds.includes(u.id));
  if (confirmed.length === 0) return null;

  let totalPositions = 0;
  let totalTransactions = 0;
  let totalBalances = 0;
  const institutions = new Set<string>();

  for (const u of confirmed) {
    const ext = u.extracted_data as PortsieExtraction | null;
    if (!ext) continue;
    for (const acct of ext.accounts) {
      totalPositions += acct.positions.length;
      totalTransactions += acct.transactions.length;
      totalBalances += acct.balances.length;
      if (acct.account_info.institution_name) {
        institutions.add(acct.account_info.institution_name);
      }
    }
    totalPositions += ext.unallocated_positions.length;
  }

  return { totalPositions, totalTransactions, totalBalances, institutions: [...institutions], fileCount: confirmed.length };
}

export function UploadSection({
  brokerageContext,
}: {
  brokerageContext?: string;
} = {}) {
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
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  // Track IDs that were auto-confirmed in this batch for summary dialog
  const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
  const [processingPreset, setProcessingPreset] = useState<ProcessingPreset>(DEFAULT_PRESET);
  const router = useRouter();

  // Auto-redirect countdown after save
  useEffect(() => {
    if (redirectCountdown === null) return;
    if (redirectCountdown <= 0) {
      localStorage.setItem("portsie:portfolio-tab", "assets");
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
    setConfirmedIds([]);
  }

  // Poll uploads in QC states (qc_running, qc_fixing) every 3 seconds
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  useEffect(() => {
    const qcIds = uploads
      .filter((u) => QC_POLL_STATUSES.has(u.parse_status))
      .map((u) => u.id);
    if (qcIds.length === 0) return;

    const interval = setInterval(async () => {
      for (const id of qcIds) {
        try {
          const res = await fetch(`/api/upload/${id}`);
          if (res.ok) {
            const updated = await res.json();
            setUploads((prev) =>
              prev.map((u) => (u.id === id ? updated : u))
            );
          }
        } catch {
          // Silently fail — will retry on next poll
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [uploads.map((u) => `${u.id}:${u.parse_status}`).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch existing uploads on mount, then auto-process any pending ones
  const hasAutoProcessed = useRef(false);
  const fetchUploads = useCallback(async () => {
    try {
      const res = await fetch("/api/upload");
      if (res.ok) {
        const data: UploadedStatement[] = await res.json();
        setUploads(data);
        // Auto-process any pending/failed files from previous sessions (once)
        if (!hasAutoProcessed.current) {
          hasAutoProcessed.current = true;
          const pendingIds = data
            .filter((u: UploadedStatement) =>
              (u.parse_status === "pending" || u.parse_status === "failed") && !u.confirmed_at
            )
            .map((u: UploadedStatement) => u.id);
          if (pendingIds.length > 0) {
            // Defer to next tick so state is settled
            setTimeout(() => handleBatchProcess(pendingIds), 0);
          }
        }
      }
    } catch {
      // Silently fail — user can still upload new files
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  // Handle new file uploaded (dedup: if ID already exists, update in place)
  function handleFileUploaded(statement: UploadedStatement) {
    setUploads((prev) => {
      if (prev.some((u) => u.id === statement.id)) {
        return prev.map((u) => (u.id === statement.id ? statement : u));
      }
      return [statement, ...prev];
    });
  }

  // Trigger LLM processing for a single upload (auto-links account and saves data).
  // Returns true if auto-confirm succeeded (data was written to DB).
  async function handleProcess(uploadId: string): Promise<boolean> {
    let autoConfirmed = false;
    setProcessingIds((prev) => new Set(prev).add(uploadId));
    setProcessCount((prev) => ({ ...prev, [uploadId]: (prev[uploadId] ?? 0) + 1 }));
    // Record processing start timestamp (keep existing q timestamp)
    setTimestamps((prev) => ({
      ...prev,
      [uploadId]: { ...prev[uploadId], s: new Date().toISOString() },
    }));

    try {
      const res = await fetch(`/api/upload/${uploadId}/extract?auto_confirm=true&preset=${processingPreset}`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (res.ok && body) {
        autoConfirmed = !!body.autoConfirmed;
      }
    } catch {
      // Network error — status will be reflected in the refreshed upload record
    } finally {
      // Record end timestamp
      setTimestamps((prev) => ({
        ...prev,
        [uploadId]: { ...prev[uploadId], e: new Date().toISOString() },
      }));

      // Refresh the upload record — retry once after a short delay if status is
      // still "processing" (DB write from the extract endpoint may not have
      // propagated yet).
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
          const detailRes = await fetch(`/api/upload/${uploadId}`);
          if (detailRes.ok) {
            const updated = await detailRes.json();
            setUploads((prev) =>
              prev.map((u) => (u.id === uploadId ? updated : u))
            );
            // If we got a terminal status, no need to retry
            if (updated.parse_status !== "processing") break;
          }
        } catch {
          // Silently fail — user can refresh manually
        }
      }

      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(uploadId);
        return next;
      });
    }
    return autoConfirmed;
  }

  // Batch process: run sequentially so only one is actively processing at a time.
  // Queued items show "Queued" until their turn.
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

    // Process sequentially so queued items stay visually distinct
    (async () => {
      const batchConfirmedIds: string[] = [];
      for (const id of ids) {
        // Move from queued → processing
        setQueuedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        const confirmed = await handleProcess(id);
        if (confirmed) batchConfirmedIds.push(id);
        setBatchDone((prev) => {
          const next = prev + 1;
          if (next >= ids.length) {
            setQueuedIds(new Set());
            setBatchTotal(0);
            return 0;
          }
          return next;
        });
      }
      // After batch completes, auto-open review for the first file that has data.
      // We use the setUploads updater to read latest state (closure is stale).
      setUploads((prev) => {
        const reviewable = ids.find((fid) => {
          const u = prev.find((up) => up.id === fid);
          return u && ["completed", "extracted", "partial"].includes(u.parse_status);
        });
        if (reviewable) setReviewingId(reviewable);
        return prev;
      });
      if (batchConfirmedIds.length > 0) {
        setConfirmedIds(batchConfirmedIds);
        setRedirectCountdown(5);
      }
    })();
  }

  // Toggle review panel for a specific upload (empty string closes)
  function handleReview(uploadId: string) {
    setReviewingId(uploadId || null);
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
      const id = reviewingId;
      const now = new Date().toISOString();
      setTimestamps((prev) => ({
        ...prev,
        [id]: { q: now },
      }));
      setReviewingId(null);
      const confirmed = await handleProcess(id);
      // Re-open review after reprocessing completes
      setUploads((prev) => {
        const u = prev.find((up) => up.id === id);
        if (u && ["completed", "extracted", "partial"].includes(u.parse_status)) {
          setReviewingId(id);
        }
        return prev;
      });
      if (confirmed) {
        setConfirmedIds([id]);
        setRedirectCountdown(5);
      }
    }
  }

  const savedSummary = redirectCountdown !== null ? buildSavedSummary(uploads, confirmedIds) : null;

  return (
    <div className="space-y-4">
      {/* Auto-redirect dialog overlay */}
      {redirectCountdown !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            {/* Success icon */}
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h3 className="text-center text-lg font-semibold text-gray-900">
              Data Saved
            </h3>

            {/* Summary of what was saved */}
            {savedSummary && (
              <div className="mt-3 space-y-2">
                {savedSummary.institutions.length > 0 && (
                  <p className="text-center text-sm text-gray-600">
                    {savedSummary.institutions.join(", ")}
                  </p>
                )}
                <div className="flex flex-wrap justify-center gap-2">
                  {savedSummary.totalPositions > 0 && (
                    <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700">
                      {savedSummary.totalPositions} position{savedSummary.totalPositions !== 1 ? "s" : ""}
                    </span>
                  )}
                  {savedSummary.totalTransactions > 0 && (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                      {savedSummary.totalTransactions} transaction{savedSummary.totalTransactions !== 1 ? "s" : ""}
                    </span>
                  )}
                  {savedSummary.totalBalances > 0 && (
                    <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">
                      {savedSummary.totalBalances} balance{savedSummary.totalBalances !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Countdown progress bar */}
            <div className="mt-5">
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-green-500 transition-all duration-1000 ease-linear"
                  style={{ width: `${((5 - (redirectCountdown ?? 0)) / 5) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-center text-sm text-gray-500">
                Opening dashboard in {redirectCountdown}s...
              </p>
            </div>

            {/* Actions */}
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                onClick={() => {
                  localStorage.setItem("portsie:portfolio-tab", "assets");
                  router.push("/dashboard");
                }}
                className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Go now
              </button>
              <button
                onClick={cancelRedirect}
                className="rounded-lg border border-gray-200 px-5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Stay here
              </button>
            </div>
          </div>
        </div>
      )}

      <h2 className="text-lg font-semibold">Upload Statements</h2>

      {brokerageContext && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm text-blue-800">
          <p className="font-medium">
            What to upload for {brokerageContext}:
          </p>
          <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-blue-700">
            <li>
              <strong>PDF printout</strong> of your positions and account summary
            </li>
            <li>
              <strong>JSON</strong> of your transaction log
            </li>
            <li className="text-blue-600">
              We also support CSV, Excel, OFX/QFX, images, and other formats
            </li>
          </ul>
        </div>
      )}

      <UploadDropzone onUploaded={handleFileUploaded} onBatchComplete={handleBatchProcess} />

      <div className="flex items-center justify-end gap-4">
        <ProcessingPresetSelect
          value={processingPreset}
          onChange={setProcessingPreset}
          disabled={processingIds.size > 0 || queuedIds.size > 0}
        />
        <VerificationSelect
          disabled={processingIds.size > 0 || queuedIds.size > 0}
        />
      </div>

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
          processingPreset={processingPreset}
          reviewingId={reviewingId}
          onReview={handleReview}
          onDelete={handleDelete}
          onReprocess={handleReprocess}
          onSaved={(updated) => {
            setUploads((prev) =>
              prev.map((u) => (u.id === updated.id ? updated : u))
            );
            setConfirmedIds([updated.id]);
            setRedirectCountdown(5);
          }}
          onCloseReview={() => setReviewingId(null)}
        />
      )}
    </div>
  );
}
