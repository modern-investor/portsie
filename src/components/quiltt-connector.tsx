"use client";

import { useState, useCallback } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Check, CircleAlert, Landmark } from "lucide-react";

// Quiltt global types (injected by cdn.quiltt.io/v1/connector.js)
declare global {
  interface Window {
    Quiltt?: {
      authenticate: (token: string) => void;
      connect: (connectorId: string, options?: Record<string, unknown>) => void;
    };
  }
}

interface QuilttConnectorProps {
  /** Called after successful connection with the connection ID */
  onSuccess?: (connectionId: string) => void;
  /** Called on error */
  onError?: (error: string) => void;
  /** Pre-filter the connector to a specific institution name */
  institutionSearch?: string;
}

type ConnectorState =
  | "idle"
  | "loading-session"
  | "ready"
  | "connecting"
  | "processing"
  | "success"
  | "error";

export function QuilttConnector({
  onSuccess,
  onError,
  institutionSearch,
}: QuilttConnectorProps) {
  const [state, setState] = useState<ConnectorState>("idle");
  const [error, setError] = useState("");
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    totalAccounts: number;
  } | null>(null);

  const connectorId = process.env.NEXT_PUBLIC_QUILTT_CONNECTOR_ID;

  const handleConnect = useCallback(async () => {
    if (!connectorId) {
      setError("Quiltt connector ID not configured");
      setState("error");
      return;
    }

    if (!window.Quiltt) {
      setError("Quiltt SDK not loaded yet. Please try again.");
      setState("error");
      return;
    }

    setState("loading-session");
    setError("");

    try {
      // 1. Get a session token from our API
      const sessionRes = await fetch("/api/quiltt/session", { method: "POST" });
      if (!sessionRes.ok) {
        const data = await sessionRes.json();
        throw new Error(data.error || "Failed to create session");
      }

      const { token } = await sessionRes.json();

      // 2. Authenticate with Quiltt
      window.Quiltt.authenticate(token);

      // 3. Open the connector
      setState("connecting");

      const connectOptions: Record<string, unknown> = {};
      if (institutionSearch) {
        connectOptions.search = institutionSearch;
      }

      window.Quiltt.connect(connectorId, connectOptions);

      // The Quiltt SDK handles the rest via its own UI.
      // We listen for postMessage events from the connector.
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      setState("error");
      onError?.(msg);
    }
  }, [connectorId, institutionSearch, onError]);

  // Listen for Quiltt connector events via postMessage
  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      // Quiltt connector sends messages with a specific structure
      if (event.data?.type === "quiltt:connect:success") {
        const connectionId = event.data?.connectionId;
        if (!connectionId) return;

        setState("processing");

        try {
          // Notify our backend about the new connection
          const callbackRes = await fetch("/api/quiltt/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ connectionId }),
          });

          if (!callbackRes.ok) {
            const data = await callbackRes.json();
            throw new Error(data.error || "Failed to process connection");
          }

          const result = await callbackRes.json();
          setImportResult({
            imported: result.imported,
            totalAccounts: result.totalAccounts,
          });
          setState("success");
          onSuccess?.(connectionId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Processing failed";
          setError(msg);
          setState("error");
          onError?.(msg);
        }
      } else if (event.data?.type === "quiltt:connect:error") {
        const msg = event.data?.error || "Connection failed";
        setError(msg);
        setState("error");
        onError?.(msg);
      } else if (event.data?.type === "quiltt:connect:close") {
        // User closed the connector without completing
        if (state === "connecting") {
          setState("ready");
        }
      }
    },
    [onSuccess, onError, state]
  );

  // Register message listener when SDK loads
  const handleSdkLoad = useCallback(() => {
    setSdkLoaded(true);
    setState("ready");
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  return (
    <div className="space-y-4">
      {/* Load Quiltt SDK */}
      <Script
        src="https://cdn.quiltt.io/v1/connector.js"
        onLoad={handleSdkLoad}
        strategy="lazyOnload"
      />

      {state === "success" ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-chart-2/15">
                <Check className="size-5 text-chart-2" />
              </div>
              <div>
                <p className="font-semibold leading-none">
                  Account Connected!
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {importResult
                    ? `${importResult.imported} new account${importResult.imported !== 1 ? "s" : ""} imported (${importResult.totalAccounts} total).`
                    : "Your accounts are being synced."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="size-5" />
              Connect via Open Banking
            </CardTitle>
            <CardDescription>
              Securely link your bank or brokerage account to automatically sync
              your portfolio data. Powered by Quiltt
              {institutionSearch ? ` — pre-filtered to ${institutionSearch}` : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <CircleAlert className="size-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              className="w-full"
              onClick={handleConnect}
              disabled={
                !sdkLoaded ||
                state === "loading-session" ||
                state === "connecting" ||
                state === "processing"
              }
            >
              {state === "loading-session" || state === "processing" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {state === "loading-session"
                    ? "Initializing..."
                    : "Processing..."}
                </>
              ) : state === "connecting" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Waiting for connection...
                </>
              ) : !sdkLoaded ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Loading...
                </>
              ) : (
                "Connect Account"
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Your credentials are encrypted end-to-end and never stored by
              Portsie. Connection is handled by Quiltt&apos;s secure
              infrastructure.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
