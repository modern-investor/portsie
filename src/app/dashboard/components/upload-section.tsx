"use client";

import { useState, useEffect, useCallback } from "react";
import { UploadDropzone } from "./upload-dropzone";
import { UploadList } from "./upload-list";
import { UploadReview } from "./upload-review";
import type { UploadedStatement, AccountMatch } from "@/lib/upload/types";

export function UploadSection() {
  const [uploads, setUploads] = useState<UploadedStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [accountMatches, setAccountMatches] = useState<AccountMatch[]>([]);

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

  // Trigger LLM processing for a single upload
  async function handleProcess(uploadId: string) {
    setProcessingIds((prev) => new Set(prev).add(uploadId));

    try {
      const res = await fetch(`/api/upload/${uploadId}/process`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.ok) {
        // Refresh the specific upload record
        const detailRes = await fetch(`/api/upload/${uploadId}`);
        if (detailRes.ok) {
          const updated = await detailRes.json();
          setUploads((prev) =>
            prev.map((u) => (u.id === uploadId ? updated : u))
          );
        }
        // Store account matches for review
        if (data.accountMatches) {
          setAccountMatches(data.accountMatches);
        }
      } else {
        // Refresh to show error status
        const detailRes = await fetch(`/api/upload/${uploadId}`);
        if (detailRes.ok) {
          const updated = await detailRes.json();
          setUploads((prev) =>
            prev.map((u) => (u.id === uploadId ? updated : u))
          );
        }
      }
    } catch {
      // Refresh to get current status
      const detailRes = await fetch(`/api/upload/${uploadId}`);
      if (detailRes.ok) {
        const updated = await detailRes.json();
        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? updated : u))
        );
      }
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(uploadId);
        return next;
      });
    }
  }

  // Batch process: process sequentially so users see queued → processing → done
  async function handleBatchProcess(ids: string[]) {
    // Mark all as queued, set up progress tracking
    setQueuedIds(new Set(ids));
    setBatchTotal(ids.length);
    setBatchDone(0);

    for (const id of ids) {
      // Move from queued to processing
      setQueuedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await handleProcess(id);
      setBatchDone((prev) => prev + 1);
    }

    // Clear batch state when done
    setQueuedIds(new Set());
    setBatchTotal(0);
    setBatchDone(0);
  }

  // Open review panel
  function handleReview(uploadId: string) {
    setReviewingId(uploadId);
    // If we don't have account matches cached, re-fetch them
    const upload = uploads.find((u) => u.id === uploadId);
    if (upload?.detected_account_info && accountMatches.length === 0) {
      // Account matches were from processing step; if we're reviewing later,
      // the process route already ran so matches may need re-fetching.
      // For now, we use whatever was cached.
    }
  }

  // Delete an upload
  async function handleDelete(uploadId: string) {
    const res = await fetch(`/api/upload/${uploadId}`, { method: "DELETE" });
    if (res.ok) {
      setUploads((prev) => prev.filter((u) => u.id !== uploadId));
      if (reviewingId === uploadId) setReviewingId(null);
    }
  }

  // Confirm extraction and save to DB
  async function handleConfirm(params: {
    accountId?: string;
    createNewAccount?: boolean;
    accountInfo?: {
      account_type?: string;
      institution_name?: string;
      account_nickname?: string;
    };
  }) {
    if (!reviewingId) return;

    const res = await fetch(`/api/upload/${reviewingId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Confirmation failed");
    }

    // Refresh the upload record
    const detailRes = await fetch(`/api/upload/${reviewingId}`);
    if (detailRes.ok) {
      const updated = await detailRes.json();
      setUploads((prev) =>
        prev.map((u) => (u.id === reviewingId ? updated : u))
      );
    }

    setReviewingId(null);
  }

  // Re-process a file
  async function handleReprocess() {
    if (reviewingId) {
      setReviewingId(null);
      await handleProcess(reviewingId);
    }
  }

  const reviewingUpload = reviewingId
    ? uploads.find((u) => u.id === reviewingId)
    : null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Upload Statements</h2>

      <UploadDropzone onUploaded={handleFileUploaded} />

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-gray-200" />
          ))}
        </div>
      ) : (
        <UploadList
          uploads={uploads}
          processingIds={processingIds}
          queuedIds={queuedIds}
          batchTotal={batchTotal}
          batchDone={batchDone}
          onBatchProcess={handleBatchProcess}
          onReview={handleReview}
          onDelete={handleDelete}
        />
      )}

      {reviewingUpload && (
        <UploadReview
          upload={reviewingUpload}
          accountMatches={accountMatches}
          onConfirm={handleConfirm}
          onReprocess={handleReprocess}
          onClose={() => setReviewingId(null)}
        />
      )}
    </div>
  );
}
