"use client";

import { useState, useEffect } from "react";
import { Brain, AlertTriangle, ShieldCheck, Activity } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LLMSettings } from "./llm-settings";
import { ExtractionFailures } from "./extraction-failures";
import { QualityChecks } from "./quality-checks";
import { AdminDiagnostics } from "./admin-diagnostics";

type SettingsTab = "llm" | "failures" | "quality" | "diagnostics";

const STORAGE_KEY = "portsie:settings-tab";
const VALID_TABS: SettingsTab[] = ["llm", "failures", "quality", "diagnostics"];

export function SettingsPanel() {
  const [tab, setTab] = useState<SettingsTab>("llm");

  // Restore saved tab from localStorage after hydration to avoid React #418
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as SettingsTab | null;
    // Don't restore "diagnostics" tab until we know admin status
    if (saved && VALID_TABS.includes(saved) && saved !== "diagnostics") setTab(saved);
  }, []);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [qcIssueCount, setQcIssueCount] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);

  // Check admin status on mount
  useEffect(() => {
    fetch("/api/admin/status")
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (data.isAdmin) {
          setShowAdmin(true);
          // Restore diagnostics tab if it was previously saved
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved === "diagnostics") setTab("diagnostics");
        }
      })
      .catch(() => {});
  }, []);

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
            Default Extraction Models
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
          <TabsTrigger value="quality">
            <ShieldCheck className="size-4" />
            Quality
            {qcIssueCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-xs font-medium text-white">
                {qcIssueCount}
              </span>
            )}
          </TabsTrigger>
          {showAdmin && (
            <TabsTrigger value="diagnostics">
              <Activity className="size-4" />
              Diagnostics
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="llm">
          <LLMSettings />
        </TabsContent>
        <TabsContent value="failures">
          <ExtractionFailures onUnresolvedCount={setUnresolvedCount} />
        </TabsContent>
        <TabsContent value="quality">
          <QualityChecks onUnresolvedCount={setQcIssueCount} />
        </TabsContent>
        {showAdmin && (
          <TabsContent value="diagnostics">
            <AdminDiagnostics />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
