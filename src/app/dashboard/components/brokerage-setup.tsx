"use client";

import { useState } from "react";
import { getBrokerageById } from "@/lib/brokerage/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { SchwabSetupInline } from "./schwab-setup-inline";
import { UploadSection } from "./upload-section";
import { QuilttConnector } from "@/components/quiltt-connector";

type TabId = "api" | "open-banking" | "upload";

export function BrokerageSetup({
  brokerageId,
  hasCredentials,
  onBack,
}: {
  brokerageId: string;
  hasCredentials: boolean;
  onBack: () => void;
}) {
  const brokerage = getBrokerageById(brokerageId);

  // Determine default tab: API > Open Banking > Upload
  const defaultTab: TabId = brokerage?.hasApiSupport
    ? "api"
    : brokerage?.hasQuilttSupport
      ? "open-banking"
      : "upload";

  const [tab, setTab] = useState<TabId>(defaultTab);

  if (!brokerage) return null;

  // Build the list of available tabs
  const tabs: { id: TabId; label: string }[] = [];
  if (brokerage.hasApiSupport) {
    tabs.push({ id: "api", label: "Connect via API" });
  }
  if (brokerage.hasQuilttSupport) {
    tabs.push({ id: "open-banking", label: "Open Banking" });
  }
  tabs.push({ id: "upload", label: "Upload Files" });

  const showTabs = tabs.length > 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <h2 className="text-xl font-bold text-gray-900">{brokerage.name}</h2>
      </div>

      {showTabs ? (
        <>
          <div className="flex gap-1 border-b">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm font-medium transition-colors sm:py-2 ${
                  tab === t.id
                    ? "border-b-2 border-gray-900 text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "api" && (
            <SchwabSetupInline hasCredentials={hasCredentials} />
          )}

          {tab === "open-banking" && (
            <QuilttConnector
              institutionSearch={brokerage.quilttInstitutionSearch}
              onSuccess={() => {
                // Could navigate to portfolio view or refresh
              }}
            />
          )}

          {tab === "upload" && <UploadSection />}
        </>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            Upload your {brokerage.name} portfolio files to get started.
          </p>
          <UploadSection />
        </>
      )}
    </div>
  );
}
