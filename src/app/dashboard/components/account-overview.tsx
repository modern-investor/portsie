"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { UnifiedAccount, PortfolioData } from "@/app/api/portfolio/positions/route";

const PRE_TAX_TYPES = new Set([
  "ira",
  "roth_ira",
  "traditional_ira",
  "401k",
  "403b",
]);

function classifyTaxStatus(accountType: string): "pre-tax" | "post-tax" {
  const normalized = accountType.toLowerCase().replace(/\s+/g, "_");
  return PRE_TAX_TYPES.has(normalized) ? "pre-tax" : "post-tax";
}

function formatAccountType(type: string): string {
  const map: Record<string, string> = {
    individual: "Individual",
    ira: "IRA",
    roth_ira: "Roth IRA",
    traditional_ira: "Traditional IRA",
    "401k": "401(k)",
    "403b": "403(b)",
    "529": "529",
    joint: "Joint",
    trust: "Trust",
    custodial: "Custodial",
    margin: "Margin",
    CASH: "Cash",
    MARGIN: "Margin",
  };
  return map[type] ?? type;
}

interface GroupedAccounts {
  entityName: string;
  preTax: UnifiedAccount[];
  postTax: UnifiedAccount[];
}

function groupAccountsByEntity(accounts: UnifiedAccount[]): GroupedAccounts[] {
  const entityMap = new Map<
    string,
    { preTax: UnifiedAccount[]; postTax: UnifiedAccount[] }
  >();

  for (const acct of accounts) {
    const entityName = acct.entityName || "Personal";
    if (!entityMap.has(entityName)) {
      entityMap.set(entityName, { preTax: [], postTax: [] });
    }
    const group = entityMap.get(entityName)!;
    if (classifyTaxStatus(acct.type) === "pre-tax") {
      group.preTax.push(acct);
    } else {
      group.postTax.push(acct);
    }
  }

  // Sort: "Personal" first, then alphabetical
  return Array.from(entityMap.entries())
    .sort(([a], [b]) => {
      if (a === "Personal") return -1;
      if (b === "Personal") return 1;
      return a.localeCompare(b);
    })
    .map(([entityName, { preTax, postTax }]) => ({
      entityName,
      preTax: preTax.sort((a, b) => a.name.localeCompare(b.name)),
      postTax: postTax.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

export function AccountOverview({ hideValues }: { hideValues: boolean }) {
  const [accounts, setAccounts] = useState<UnifiedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    fetch("/api/portfolio/positions")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch accounts");
        return res.json();
      })
      .then((data: PortfolioData) => setAccounts(data.accounts))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function formatDollar(value: number, fractionDigits = 2): ReactNode {
    if (hideValues) {
      return <span className="text-gray-300 select-none">$*****</span>;
    }
    return (
      <>
        $
        {value.toLocaleString("en-US", {
          minimumFractionDigits: fractionDigits,
          maximumFractionDigits: fractionDigits,
        })}
      </>
    );
  }

  async function saveNickname(accountId: string) {
    if (!editValue.trim()) {
      setEditingId(null);
      return;
    }

    // Skip for Schwab-prefixed IDs (those are virtual IDs)
    if (accountId.startsWith("schwab_")) {
      setEditingId(null);
      return;
    }

    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_nickname: editValue.trim() }),
      });

      if (res.ok) {
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === accountId ? { ...a, name: editValue.trim() } : a
          )
        );
      }
    } catch {
      // Silent fail — name stays as is
    }

    setEditingId(null);
  }

  if (loading) {
    return (
      <div className="rounded-lg border p-4 sm:p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 rounded bg-gray-200" />
          <div className="h-8 w-48 rounded bg-gray-200" />
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-8">
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="h-4 w-24 rounded bg-gray-200" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (accounts.length === 0) return null;

  const groups = groupAccountsByEntity(accounts);
  const showEntityHeaders = groups.length > 1 || groups[0]?.entityName !== "Personal";

  function renderAccountCard(acct: UnifiedAccount) {
    const isEditing = editingId === acct.id;
    const canEdit = !acct.id.startsWith("schwab_");

    return (
      <div key={acct.id} className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {isEditing ? (
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => saveNickname(acct.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveNickname(acct.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  className="rounded border px-2 py-0.5 text-sm font-medium focus:border-blue-400 focus:outline-none"
                />
              ) : (
                <p
                  className={`text-sm font-medium truncate ${canEdit ? "cursor-pointer hover:text-blue-600" : ""}`}
                  onClick={() => {
                    if (canEdit) {
                      setEditingId(acct.id);
                      setEditValue(acct.name);
                    }
                  }}
                  title={canEdit ? "Click to rename" : undefined}
                >
                  {acct.name}
                </p>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {[
                acct.institution,
                formatAccountType(acct.type),
                acct.source === "schwab_api" ? "API" : null,
              ]
                .filter(Boolean)
                .join(" \u00b7 ")}
            </p>
          </div>
          <p className="text-xl font-bold shrink-0 ml-4">
            {formatDollar(acct.liquidationValue)}
          </p>
        </div>
        <div className="mt-2 flex flex-col gap-1 text-sm text-gray-500 sm:flex-row sm:gap-6">
          {acct.cashBalance > 0 && (
            <span>Cash: {formatDollar(acct.cashBalance)}</span>
          )}
        </div>
      </div>
    );
  }

  function renderTaxGroup(label: string, accts: UnifiedAccount[]) {
    if (accts.length === 0) return null;
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          {label}
        </p>
        {accts.map(renderAccountCard)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.entityName} className="space-y-3">
          {showEntityHeaders && (
            <h3 className="text-sm font-semibold text-gray-700 border-b pb-1">
              {group.entityName}
            </h3>
          )}
          {renderTaxGroup("Tax-Advantaged", group.preTax)}
          {renderTaxGroup("Taxable", group.postTax)}
        </div>
      ))}
    </div>
  );
}
