"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Link2, Upload } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SchwabConnect } from "./schwab-connect";
import { BrokerageSelection } from "./brokerage-selection";
import { BrokerageSetup } from "./brokerage-setup";
import { UploadSection } from "./upload-section";

type ConnectionsSubTab = "api" | "uploads";

const STORAGE_KEY = "portsie:connections-tab";

type SetupView = "list" | "setup";

export function ConnectionsView({
  isConnected,
  hasCredentials,
}: {
  isConnected: boolean;
  hasCredentials: boolean;
}) {
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const initialTab: ConnectionsSubTab =
    urlTab === "api" || urlTab === "uploads"
      ? urlTab
      : typeof window !== "undefined"
        ? ((localStorage.getItem(STORAGE_KEY) as ConnectionsSubTab) ?? "api")
        : "api";
  const [subTab, setSubTab] = useState<ConnectionsSubTab>(initialTab);
  const [setupView, setSetupView] = useState<SetupView>("list");
  const [pendingUploadCount, setPendingUploadCount] = useState(0);

  // Sync tab when URL search params change (e.g. client-side navigation)
  useEffect(() => {
    if (urlTab === "api" || urlTab === "uploads") {
      setSubTab(urlTab);
    }
  }, [urlTab]);

  // Fetch pending/processing upload count for badge
  useEffect(() => {
    fetch("/api/upload")
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        const count = Array.isArray(data)
          ? data.filter((u: { parse_status: string }) =>
              u.parse_status === "pending" || u.parse_status === "processing"
            ).length
          : 0;
        setPendingUploadCount(count);
      })
      .catch(() => {});
  }, []);

  const [selectedBrokerage, setSelectedBrokerage] = useState<string | null>(
    null
  );

  function handleBrokerageSelect(brokerageId: string) {
    setSelectedBrokerage(brokerageId);
    setSetupView("setup");
  }

  function handleBackToList() {
    setSelectedBrokerage(null);
    setSetupView("list");
  }

  return (
    <div className="space-y-6">
      <Tabs
        value={subTab}
        onValueChange={(v) => {
          const tab = v as ConnectionsSubTab;
          setSubTab(tab);
          localStorage.setItem(STORAGE_KEY, tab);
          setSetupView("list");
          setSelectedBrokerage(null);
        }}
      >
        <TabsList>
          <TabsTrigger value="api">
            <Link2 className="size-4" />
            API Connections
          </TabsTrigger>
          <TabsTrigger value="uploads">
            <Upload className="size-4" />
            Uploads
            {pendingUploadCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-medium text-white">
                {pendingUploadCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* API Connections sub-tab */}
        <TabsContent value="api">
          <div className="space-y-6">
            {setupView === "list" && (
              <>
                <SchwabConnect
                  isConnected={isConnected}
                  hasCredentials={hasCredentials}
                />
                <BrokerageSelection onSelect={handleBrokerageSelect} />
              </>
            )}
            {setupView === "setup" && selectedBrokerage && (
              <BrokerageSetup
                brokerageId={selectedBrokerage}
                hasCredentials={hasCredentials}
                onBack={handleBackToList}
              />
            )}
          </div>
        </TabsContent>

        {/* Uploads sub-tab */}
        <TabsContent value="uploads">
          <UploadSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
