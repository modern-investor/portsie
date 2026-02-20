"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Dashboard error boundary]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-red-800">
          Something went wrong loading the dashboard
        </h2>
        <p className="mt-2 text-sm text-red-600">
          {error.message || "An unexpected error occurred."}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Try again
          </button>
          <a
            href="/dashboard/connections"
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            Go to Connections
          </a>
        </div>
      </div>
    </div>
  );
}
