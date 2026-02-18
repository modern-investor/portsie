"use client";

import { useState, useEffect, type ReactNode } from "react";
import { QuilttProvider } from "@quiltt/react";

export function QuilttProviderWrapper({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/quiltt/session")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to get session");
        const data = await res.json();
        setToken(data.token);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-gray-500">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        Preparing secure connection...
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
        Unable to initialize account linking. Please try again later.
      </div>
    );
  }

  return <QuilttProvider token={token}>{children}</QuilttProvider>;
}
