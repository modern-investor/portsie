"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function StepIndicator({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
        const isActive = step === current;
        const isCompleted = step < current;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                isActive
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : isCompleted
                    ? "bg-green-500 text-white"
                    : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              {isCompleted ? "\u2713" : step}
            </div>
            {step < total && (
              <div
                className={`h-0.5 w-8 ${
                  isCompleted
                    ? "bg-green-500"
                    : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SchwabSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("");

  useEffect(() => {
    setCallbackUrl(`${window.location.origin}/schwab/callback`);

    // Check if user already has credentials saved
    fetch("/api/schwab/credentials")
      .then((res) => res.json())
      .then((data) => {
        if (data.hasCredentials) {
          setStep(3);
        }
      })
      .catch(() => {});
  }, []);

  async function handleCopy() {
    await navigator.clipboard.writeText(callbackUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSaveCredentials() {
    if (!appKey.trim() || !appSecret.trim()) {
      setError("Both fields are required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/schwab/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appKey: appKey.trim(), appSecret: appSecret.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save credentials");
      }

      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setError("");

    try {
      const res = await fetch("/api/schwab/auth");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start connection");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setConnecting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg p-6">
      <button
        onClick={() => router.push("/dashboard")}
        className="mb-6 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
      >
        &larr; Back to Dashboard
      </button>

      <h1 className="text-2xl font-bold">Set Up Schwab</h1>
      <p className="mt-1 text-sm text-gray-500">
        Connect your brokerage account to view your portfolio in Portsie.
      </p>

      <div className="mt-6 mb-8">
        <StepIndicator current={step} total={3} />
      </div>

      {/* Step 1: Create Schwab Developer App */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="rounded-lg border p-6 space-y-4">
            <h2 className="text-lg font-semibold">
              Create a Schwab Developer App
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Portsie connects to your Schwab account through the Schwab API.
              You need to create a free developer app to get API credentials.
            </p>

            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed">
              <li>
                Go to{" "}
                <a
                  href="https://developer.schwab.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline hover:no-underline"
                >
                  developer.schwab.com
                </a>{" "}
                and sign in with your Schwab brokerage credentials.
              </li>
              <li>
                Navigate to <strong>My Apps</strong> and click{" "}
                <strong>Create App</strong>.
              </li>
              <li>
                Enter any app name (e.g. &ldquo;Portsie&rdquo;).
              </li>
              <li>
                For the <strong>Callback URL</strong>, copy and paste the URL
                below:
              </li>
            </ol>

            <div className="flex items-center gap-2 rounded-md border bg-gray-50 p-3 dark:bg-gray-900">
              <code className="flex-1 text-sm break-all">{callbackUrl}</code>
              <button
                onClick={handleCopy}
                className="shrink-0 rounded-md border px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed" start={5}>
              <li>
                Enable the <strong>Accounts and Trading</strong> and{" "}
                <strong>Market Data</strong> API products.
              </li>
              <li>
                Click <strong>Create</strong> to submit your app.
              </li>
            </ol>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <strong>Note:</strong> Schwab reviews new apps before activation.
              This typically takes 1&ndash;3 business days. You can continue
              with the next step now and connect once approved.
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            className="w-full rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
          >
            Next: Enter Credentials
          </button>
        </div>
      )}

      {/* Step 2: Enter Credentials */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="rounded-lg border p-6 space-y-4">
            <h2 className="text-lg font-semibold">Enter Your Credentials</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Find your App Key and App Secret in the Schwab developer portal
              under <strong>My Apps</strong>. These are stored encrypted and
              never exposed to your browser after saving.
            </p>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="appKey"
                  className="mb-1 block text-sm font-medium"
                >
                  App Key
                </label>
                <input
                  id="appKey"
                  type="text"
                  value={appKey}
                  onChange={(e) => setAppKey(e.target.value)}
                  placeholder="Your Schwab App Key"
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black dark:bg-gray-900 dark:focus:ring-white"
                />
              </div>
              <div>
                <label
                  htmlFor="appSecret"
                  className="mb-1 block text-sm font-medium"
                >
                  App Secret
                </label>
                <input
                  id="appSecret"
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder="Your Schwab App Secret"
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black dark:bg-gray-900 dark:focus:ring-white"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="rounded-md border px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              Back
            </button>
            <button
              onClick={handleSaveCredentials}
              disabled={saving || !appKey.trim() || !appSecret.trim()}
              className="flex-1 rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
            >
              {saving ? "Saving..." : "Save Credentials"}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Connect Account */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="rounded-lg border p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <span className="text-lg text-green-600 dark:text-green-400">
                  {"\u2713"}
                </span>
              </div>
              <div>
                <h2 className="text-lg font-semibold">Credentials Saved</h2>
                <p className="text-sm text-gray-500">
                  Your Schwab API credentials are securely stored.
                </p>
              </div>
            </div>

            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
              <strong>Ready to connect?</strong> Make sure your Schwab developer
              app has been approved (check its status at{" "}
              <a
                href="https://developer.schwab.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:no-underline"
              >
                developer.schwab.com
              </a>
              ). Once approved, click the button below to link your brokerage
              account.
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                {error}
              </div>
            )}
          </div>

          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
          >
            {connecting ? "Connecting..." : "Connect Schwab Account"}
          </button>

          <button
            onClick={() => router.push("/dashboard")}
            className="w-full rounded-md border px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-900"
          >
            Back to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
