"use client";

import { useState } from "react";
import {
  getBrokerageById,
  CONNECTION_METHOD_INFO,
  type ConnectionMethod,
} from "@/lib/brokerage/types";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { SchwabSetupInline } from "./schwab-setup-inline";
import { QuilttConnector } from "@/components/quiltt-connector";

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
  const methods = brokerage?.connectionMethods ?? ["quiltt"];
  const [activeMethod, setActiveMethod] = useState<ConnectionMethod>(
    methods[0] ?? "quiltt"
  );

  if (!brokerage) return null;

  const showTabs = methods.length > 1;
  const isGeneric = brokerage.id === "other-bank" || brokerage.id === "other-brokerage";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <h2 className="text-xl font-bold text-gray-900">{brokerage.name}</h2>
      </div>

      {/* Tabs — rendered dynamically from connectionMethods */}
      {showTabs && (
        <div className="flex gap-1 border-b">
          {methods.map((method) => {
            const info = CONNECTION_METHOD_INFO[method];
            const isActive = activeMethod === method;
            return (
              <button
                key={method}
                onClick={() => setActiveMethod(method)}
                className={`px-4 py-3 text-sm font-medium transition-colors sm:py-2 ${
                  isActive
                    ? "border-b-2 border-gray-900 text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {info.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Description line for the active method */}
      <p className="text-sm text-gray-500">
        {CONNECTION_METHOD_INFO[activeMethod].description}
      </p>

      {/* Method content */}
      {activeMethod === "api" && (
        <SchwabSetupInline hasCredentials={hasCredentials} />
      )}

      {activeMethod === "quiltt" && (
        <QuilttConnector
          institutionSearch={isGeneric ? undefined : brokerage.quilttInstitutionSearch}
          onSuccess={() => {
            // Could navigate to portfolio view or refresh
          }}
        />
      )}

    </div>
  );
}
