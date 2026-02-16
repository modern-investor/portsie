"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardCopy,
  ExternalLink,
  AlertTriangle,
  CircleAlert,
  Loader2,
  Link2,
} from "lucide-react";

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
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-sm font-bold transition-colors",
                isActive && "bg-primary text-primary-foreground",
                isCompleted && "bg-chart-2 text-white",
                !isActive && !isCompleted && "bg-muted text-muted-foreground"
              )}
            >
              {isCompleted ? <Check className="size-4" /> : step}
            </div>
            {step < total && (
              <div
                className={cn(
                  "h-0.5 w-8 transition-colors",
                  isCompleted ? "bg-chart-2" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SchwabSetupInline({
  hasCredentials,
}: {
  hasCredentials: boolean;
}) {
  const [step, setStep] = useState(hasCredentials ? 3 : 1);
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("");

  useEffect(() => {
    setCallbackUrl(`${window.location.origin}/schwab/callback`);
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
        body: JSON.stringify({
          appKey: appKey.trim(),
          appSecret: appSecret.trim(),
        }),
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
    <div className="space-y-6">
      <div className="mb-8">
        <StepIndicator current={step} total={3} />
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Create a Schwab Developer App</CardTitle>
              <CardDescription>
                Portsie connects to your Schwab account through the Schwab API.
                You need to create a free developer app to get API credentials.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed">
                <li>
                  Go to{" "}
                  <a
                    href="https://developer.schwab.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium underline underline-offset-4 hover:no-underline"
                  >
                    developer.schwab.com
                    <ExternalLink className="size-3" />
                  </a>{" "}
                  and sign in with your Schwab brokerage credentials.
                </li>
                <li>
                  Navigate to <strong>My Apps</strong> and click{" "}
                  <strong>Create App</strong>.
                </li>
                <li>Enter any app name (e.g. &ldquo;Portsie&rdquo;).</li>
                <li>
                  For the <strong>Callback URL</strong>, copy and paste the URL
                  below:
                </li>
              </ol>

              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
                <code className="flex-1 break-all text-sm">{callbackUrl}</code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="size-3" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <ClipboardCopy className="size-3" />
                      Copy
                    </>
                  )}
                </Button>
              </div>

              <ol
                className="list-decimal space-y-3 pl-5 text-sm leading-relaxed"
                start={5}
              >
                <li>
                  Enable the <strong>Accounts and Trading</strong> and{" "}
                  <strong>Market Data</strong> API products.
                </li>
                <li>
                  Click <strong>Create</strong> to submit your app.
                </li>
              </ol>

              <Alert>
                <AlertTriangle className="size-4" />
                <AlertTitle>Note</AlertTitle>
                <AlertDescription>
                  Schwab reviews new apps before activation. This typically takes
                  1&ndash;3 business days. You can continue with the next step
                  now and connect once approved.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Button className="w-full" onClick={() => setStep(2)}>
            Next: Enter Credentials
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Enter Your Credentials</CardTitle>
              <CardDescription>
                Find your App Key and App Secret in the Schwab developer portal
                under <strong>My Apps</strong>. These are stored encrypted and
                never exposed to your browser after saving.
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

              <div className="space-y-2">
                <Label htmlFor="inline-appKey">App Key</Label>
                <Input
                  id="inline-appKey"
                  type="text"
                  value={appKey}
                  onChange={(e) => setAppKey(e.target.value)}
                  placeholder="Your Schwab App Key"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inline-appSecret">App Secret</Label>
                <Input
                  id="inline-appSecret"
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder="Your Schwab App Secret"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={handleSaveCredentials}
              disabled={saving || !appKey.trim() || !appSecret.trim()}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Credentials"
              )}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-chart-2/15">
                  <Check className="size-5 text-chart-2" />
                </div>
                <div>
                  <p className="font-semibold leading-none">
                    Credentials Saved
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Your Schwab API credentials are securely stored.
                  </p>
                </div>
              </div>

              <Separator />

              <Alert>
                <Link2 className="size-4" />
                <AlertTitle>Ready to connect?</AlertTitle>
                <AlertDescription>
                  Make sure your Schwab developer app has been approved (check
                  its status at{" "}
                  <a
                    href="https://developer.schwab.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium underline underline-offset-4 hover:no-underline"
                  >
                    developer.schwab.com
                    <ExternalLink className="size-3" />
                  </a>
                  ). Once approved, click the button below to link your
                  brokerage account.
                </AlertDescription>
              </Alert>

              {error && (
                <Alert variant="destructive">
                  <CircleAlert className="size-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Button
            className="w-full"
            onClick={handleConnect}
            disabled={connecting}
          >
            {connecting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Connecting...
              </>
            ) : (
              "Connect Schwab Account"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
