"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Landmark } from "lucide-react";

interface QuilttAccountRow {
  id: string;
  account_nickname: string | null;
  account_type: string | null;
  institution_name: string | null;
  quiltt_account_id: string;
  quiltt_connection_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function QuilttAccounts({
  hideValues,
}: {
  hideValues?: boolean;
}) {
  const [accounts, setAccounts] = useState<QuilttAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function fetchAccounts() {
    try {
      const res = await fetch("/api/quiltt/accounts");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setAccounts(data);
    } catch {
      setError("Failed to load Quiltt accounts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setError("");

    try {
      const res = await fetch("/api/quiltt/sync", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Sync failed");
      }
      const result = await res.json();
      setSyncResult(
        `Synced ${result.accounts} account${result.accounts !== 1 ? "s" : ""}: ${result.totalHoldings} holdings, ${result.totalTransactions} transactions`
      );
      // Refresh the account list
      await fetchAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading connected accounts...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (accounts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="size-5" />
              Open Banking Accounts
            </CardTitle>
            <CardDescription>
              Accounts linked via Quiltt Open Banking
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {syncing ? "Syncing..." : "Sync All"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
        {syncResult && (
          <p className="text-sm text-chart-2">{syncResult}</p>
        )}

        <div className="divide-y">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">
                  {hideValues
                    ? "••••••"
                    : account.account_nickname || "Linked Account"}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-gray-500">
                    {account.institution_name || "Unknown Institution"}
                  </p>
                  {account.account_type && (
                    <Badge variant="secondary" className="text-xs">
                      {account.account_type}
                    </Badge>
                  )}
                </div>
              </div>
              <Badge
                variant={account.is_active ? "default" : "secondary"}
                className="shrink-0"
              >
                {account.is_active ? "Active" : "Disconnected"}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
