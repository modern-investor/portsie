"use client";

import { useState } from "react";

export function SchwabConnect({ isConnected }: { isConnected: boolean }) {
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(isConnected);

  async function handleConnect() {
    setLoading(true);
    try {
      const res = await fetch("/api/schwab/auth");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      const res = await fetch("/api/schwab/disconnect", { method: "POST" });
      if (res.ok) {
        setConnected(false);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  if (connected) {
    return (
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
          <div>
            <p className="font-medium">Schwab Account Connected</p>
            <p className="text-sm text-gray-500">
              Your brokerage data is synced
            </p>
          </div>
        </div>
        <button
          onClick={handleDisconnect}
          disabled={loading}
          className="rounded-md border px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {loading ? "Disconnecting..." : "Disconnect"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div>
        <p className="font-medium">Connect Schwab Account</p>
        <p className="text-sm text-gray-500">
          Link your Charles Schwab brokerage to view your portfolio
        </p>
      </div>
      <button
        onClick={handleConnect}
        disabled={loading}
        className="rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "Connecting..." : "Connect"}
      </button>
    </div>
  );
}
