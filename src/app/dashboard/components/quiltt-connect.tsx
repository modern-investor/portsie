"use client";

import { useState, useCallback } from "react";
import { QuilttButton } from "@quiltt/react";
import type { ConnectorSDKCallbackMetadata } from "@quiltt/react";
import { Check, Loader2, Link2, ShieldCheck } from "lucide-react";

interface QuilttConnectProps {
  connectorId: string;
  /** Prefill institution name in Quiltt's search */
  institution?: string;
  /** Display name for the institution */
  institutionName?: string;
  onSuccess?: (accountId: string) => void;
  onError?: (error: string) => void;
}

export function QuilttConnect({
  connectorId,
  institution,
  institutionName,
  onSuccess,
  onError,
}: QuilttConnectProps) {
  const [linking, setLinking] = useState(false);
  const [linked, setLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExitSuccess = useCallback(
    async (metadata: ConnectorSDKCallbackMetadata) => {
      setLinking(true);
      setError(null);

      try {
        const res = await fetch("/api/quiltt/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectionId: metadata.connectionId,
            profileId: metadata.profileId,
            institutionName,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to save connection");
        }

        const { accountId } = await res.json();
        setLinked(true);
        onSuccess?.(accountId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Connection failed";
        setError(msg);
        onError?.(msg);
      } finally {
        setLinking(false);
      }
    },
    [institutionName, onSuccess, onError]
  );

  const handleExitError = useCallback(
    (_metadata: ConnectorSDKCallbackMetadata) => {
      setError("Account linking was interrupted. Please try again.");
      onError?.("Quiltt connector exited with error");
    },
    [onError]
  );

  if (linked) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-green-100">
            <Check className="size-5 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-green-800">
              Account Linked Successfully
            </p>
            <p className="mt-0.5 text-sm text-green-600">
              Your {institutionName || "account"} has been connected. Data will
              begin syncing shortly.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
            <Link2 className="size-4 text-blue-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">
              {institutionName
                ? `Link your ${institutionName} account`
                : "Link your account"}
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              Securely connect using encrypted credentials. Your login
              information is never shared with Portsie.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
          <ShieldCheck className="size-3.5" />
          Powered by Quiltt &mdash; bank-level encryption
        </div>

        <div className="mt-4">
          <QuilttButton
            connectorId={connectorId}
            institution={institution}
            onExitSuccess={handleExitSuccess}
            onExitError={handleExitError}
            onExitAbort={() => {}}
          >
            <span
              className={`inline-flex w-full items-center justify-center gap-2 rounded-md bg-black px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 ${
                linking ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {linking ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving connection...
                </>
              ) : (
                `Link ${institutionName || "Account"}`
              )}
            </span>
          </QuilttButton>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}
