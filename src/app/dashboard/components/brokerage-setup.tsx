"use client";

import { useState } from "react";
import { getBrokerageById } from "@/lib/brokerage/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { SchwabSetupInline } from "./schwab-setup-inline";
import { UploadSection } from "./upload-section";

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
  const [tab, setTab] = useState<"api" | "upload">(
    brokerage?.hasApiSupport ? "api" : "upload"
  );

  if (!brokerage) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <h2 className="text-xl font-bold text-gray-900">{brokerage.name}</h2>
      </div>

      {brokerage.hasApiSupport ? (
        <>
          <div className="flex gap-1 border-b">
            <button
              onClick={() => setTab("api")}
              className={`px-4 py-3 text-sm font-medium transition-colors sm:py-2 ${
                tab === "api"
                  ? "border-b-2 border-gray-900 text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Connect via API
            </button>
            <button
              onClick={() => setTab("upload")}
              className={`px-4 py-3 text-sm font-medium transition-colors sm:py-2 ${
                tab === "upload"
                  ? "border-b-2 border-gray-900 text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Upload Files
            </button>
          </div>

          {tab === "api" && (
            <SchwabSetupInline hasCredentials={hasCredentials} />
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
