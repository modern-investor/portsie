"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function SchwabCallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );
  const [error, setError] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code) {
      setStatus("error");
      setError("No authorization code received from Schwab.");
      return;
    }

    fetch("/api/schwab/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to connect Schwab account");
        }
        setStatus("success");
        router.push("/dashboard?schwab=connected");
      })
      .catch((err) => {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown error");
      });
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md rounded-lg border p-8 text-center">
        {status === "loading" && (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <h2 className="text-lg font-semibold">
              Connecting your Schwab account...
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Please wait while we complete the authorization.
            </p>
          </>
        )}
        {status === "success" && (
          <>
            <h2 className="text-lg font-semibold text-green-600">
              Connected!
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Redirecting to dashboard...
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <h2 className="text-lg font-semibold text-red-600">
              Connection Failed
            </h2>
            <p className="mt-2 text-sm text-gray-500">{error}</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-gray-800"
            >
              Back to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function SchwabCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
        </div>
      }
    >
      <SchwabCallbackHandler />
    </Suspense>
  );
}
