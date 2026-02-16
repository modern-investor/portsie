"use client";

import { useState, useRef, useCallback } from "react";
import { UPLOAD_CONFIG } from "@/lib/upload/config";
import { MIME_TO_FILE_TYPE } from "@/lib/upload/types";
import type { UploadedStatement } from "@/lib/upload/types";

export function UploadDropzone({
  onUploaded,
}: {
  onUploaded: (statement: UploadedStatement) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadingFilename, setUploadingFilename] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    if (!MIME_TO_FILE_TYPE[file.type]) {
      return `Unsupported file type: ${file.type || file.name.split(".").pop()}`;
    }
    if (file.size > UPLOAD_CONFIG.maxFileSizeBytes) {
      return `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 50MB)`;
    }
    return null;
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError("");
      setUploading(true);
      setUploadingFilename(file.name);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Upload failed");
          return;
        }

        onUploaded(data);
      } catch {
        setError("Upload failed. Please try again.");
      } finally {
        setUploading(false);
        setUploadingFilename("");
      }
    },
    [validateFile, onUploaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
      // Reset input so the same file can be re-selected
      e.target.value = "";
    },
    [uploadFile]
  );

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragging
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={UPLOAD_CONFIG.acceptString}
          onChange={handleFileSelect}
        />

        {uploading ? (
          <div className="space-y-2">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-gray-600">
              Uploading {uploadingFilename}...
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <svg
              className="mx-auto h-8 w-8 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-sm text-gray-600">
              <span className="font-medium text-blue-600">Click to upload</span>{" "}
              or drag and drop
            </p>
            <p className="text-xs text-gray-400">
              PDF, CSV, Excel, images (PNG/JPG), OFX, QFX, TXT — up to 50MB
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}
