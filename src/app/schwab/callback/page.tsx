"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Check, CircleAlert, Loader2 } from "lucide-react";

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
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Card className="text-center">
          {status === "loading" && (
            <CardHeader>
              <div className="mx-auto">
                <Loader2 className="text-primary size-8 animate-spin" />
              </div>
              <CardTitle>Connecting your Schwab account...</CardTitle>
              <CardDescription>
                Please wait while we complete the authorization.
              </CardDescription>
            </CardHeader>
          )}

          {status === "success" && (
            <CardHeader>
              <div className="bg-chart-2/15 mx-auto flex size-12 items-center justify-center rounded-full">
                <Check className="text-chart-2 size-6" />
              </div>
              <CardTitle>Connected!</CardTitle>
              <CardDescription>
                Redirecting to dashboard...
              </CardDescription>
            </CardHeader>
          )}

          {status === "error" && (
            <>
              <CardHeader>
                <div className="bg-destructive/10 mx-auto flex size-12 items-center justify-center rounded-full">
                  <CircleAlert className="text-destructive size-6" />
                </div>
                <CardTitle>Connection Failed</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert variant="destructive">
                  <CircleAlert className="size-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => router.push("/dashboard")}
                >
                  Back to Dashboard
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function SchwabCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="text-primary size-8 animate-spin" />
        </div>
      }
    >
      <SchwabCallbackHandler />
    </Suspense>
  );
}
