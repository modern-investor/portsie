"use client";

import { useState, useEffect } from "react";
import { Brain, AlertTriangle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LLMSettings } from "./llm-settings";
import { ExtractionFailures } from "./extraction-failures";

type SettingsTab = "llm" | "failures";

const STORAGE_KEY = "portsie:settings-tab";
const VALID_TABS: SettingsTab[] = ["llm", "failures"];

export function SettingsPanel() {
  const [tab, setTab] = useState<SettingsTab>(() => {
    if (typeof window === "undefined") return "llm";
    const saved = localStorage.getItem(STORAGE_KEY) as SettingsTab | null;
    return saved && VALID_TABS.includes(saved) ? saved : "llm";
  });
  const [unresolvedCount, setUnresolvedCount] = useState(0);

  // Fetch unresolved failure count on mount (for badge)
  useEffect(() => {
    fetch("/api/settings/failures")
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        setUnresolvedCount(
          Array.isArray(data) ? data.filter((f: { resolved_at: string | null }) => !f.resolved_at).length : 0
        );
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Settings</h2>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          const t = v as SettingsTab;
          setTab(t);
          localStorage.setItem(STORAGE_KEY, t);
        }}
      >
        <TabsList>
          <TabsTrigger value="llm">
            <Brain className="size-4" />
            LLM
          </TabsTrigger>
          <TabsTrigger value="failures">
            <AlertTriangle className="size-4" />
            Failures
            {unresolvedCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
                {unresolvedCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="llm">
          <LLMSettings />
        </TabsContent>
        <TabsContent value="failures">
          <ExtractionFailures onUnresolvedCount={setUnresolvedCount} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
