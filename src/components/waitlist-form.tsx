"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Server, Cloud } from "lucide-react";

export type ModelPreference = "byob" | "saas";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [modelPreference, setModelPreference] = useState<ModelPreference | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !modelPreference) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), modelPreference }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      setMessage(
        data.alreadyJoined
          ? "You're already on the list! We'll be in touch."
          : "You're on the list! Check your inbox for a welcome email."
      );
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  };

  if (status === "success") {
    return (
      <div className="flex items-center justify-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
        <CheckCircle2 className="size-4 shrink-0" />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Model preference selection */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          Which interests you?
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setModelPreference("byob")}
            className={`flex items-center gap-2 rounded-lg border-2 px-4 py-3 text-left text-sm font-medium transition-all ${
              modelPreference === "byob"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-muted-foreground/50"
            }`}
          >
            <Server className="size-4 shrink-0" />
            <div>
              <span className="block font-semibold">BYOB</span>
              <span className="text-xs opacity-80">Self-host, run locally</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setModelPreference("saas")}
            className={`flex items-center gap-2 rounded-lg border-2 px-4 py-3 text-left text-sm font-medium transition-all ${
              modelPreference === "saas"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-muted-foreground/50"
            }`}
          >
            <Cloud className="size-4 shrink-0" />
            <div>
              <span className="block font-semibold">SaaS</span>
              <span className="text-xs opacity-80">Hosted by us</span>
            </div>
          </button>
        </div>
      </div>

      {/* Email + Submit */}
      <div className="flex gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          disabled={status === "loading"}
          className="flex-1"
        />
        <Button
          type="submit"
          disabled={status === "loading" || !modelPreference}
        >
          {status === "loading" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Join"
          )}
        </Button>
      </div>
      {status === "error" && (
        <p className="text-sm text-red-600">{message}</p>
      )}
    </form>
  );
}
