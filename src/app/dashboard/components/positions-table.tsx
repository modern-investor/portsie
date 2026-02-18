"use client";

import React, { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UnifiedPosition, UnifiedAccount } from "@/app/api/portfolio/positions/route";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DISPLAY_CATEGORIES,
  getDisplayCategory,
  type DisplayCategoryId,
} from "@/lib/portfolio/display-categories";

// ── Types ───────────────────────────────────────────────────────────────────

type SortField =
  | "symbol"
  | "quantity"
  | "averagePrice"
  | "marketValue"
  | "allocationPct"
  | "dayPnl"
  | "dayPnlPct";

type SortDirection = "asc" | "desc";

interface Props {
  positions: UnifiedPosition[];
  accounts: UnifiedAccount[];
  hideValues: boolean;
}

// ── Sortable header ─────────────────────────────────────────────────────────

function SortableHeader({
  field,
  label,
  align,
  sortField,
  sortDirection,
  onSort,
}: {
  field: SortField;
  label: string;
  align?: "left" | "right";
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}) {
  const isActive = sortField === field;
  return (
    <th
      className={cn(
        "px-2 py-2 font-medium sm:px-4 sm:py-3 cursor-pointer select-none hover:bg-gray-100 transition-colors whitespace-nowrap",
        align === "right" && "text-right"
      )}
      onClick={() => onSort(field)}
    >
      <span
        className={cn(
          "inline-flex items-center gap-0.5",
          align === "right" && "justify-end"
        )}
      >
        {label}
        {isActive ? (
          sortDirection === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <span className="w-3" />
        )}
      </span>
    </th>
  );
}

// ── Multi-select account filter ─────────────────────────────────────────────

function AccountFilter({
  accounts,
  selectedIds,
  onToggle,
  onToggleInstitution,
  onClear,
}: {
  accounts: UnifiedAccount[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleInstitution: (institution: string, checked: boolean) => void;
  onClear: () => void;
}) {
  // Group accounts by institution
  const groups = useMemo(() => {
    const map = new Map<string, UnifiedAccount[]>();
    for (const a of accounts) {
      const inst = a.institution || "Other";
      const list = map.get(inst) ?? [];
      list.push(a);
      map.set(inst, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [accounts]);

  const filterLabel =
    selectedIds.size === 0
      ? "All Accounts"
      : `${selectedIds.size} account${selectedIds.size > 1 ? "s" : ""}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors">
          <Filter className="h-3.5 w-3.5 text-gray-500" />
          {filterLabel}
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="max-h-72 overflow-y-auto p-2 space-y-0.5">
          {/* All toggle */}
          <label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
            <Checkbox
              checked={selectedIds.size === 0}
              onCheckedChange={() => onClear()}
            />
            All Accounts
          </label>
          <div className="border-t my-1" />
          {/* Groups by institution */}
          {groups.map(([institution, accts]) => {
            const allSelected = accts.every((a) => selectedIds.has(a.id));
            const someSelected =
              !allSelected && accts.some((a) => selectedIds.has(a.id));
            return (
              <div key={institution}>
                <label className="flex items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:bg-gray-50 cursor-pointer">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(checked) =>
                      onToggleInstitution(institution, !!checked)
                    }
                  />
                  {institution}
                </label>
                {accts.map((acct) => (
                  <label
                    key={acct.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 pl-7 text-sm hover:bg-gray-50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedIds.has(acct.id)}
                      onCheckedChange={() => onToggle(acct.id)}
                    />
                    <span className="truncate">{acct.name}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function PositionsTable({ positions, accounts, hideValues }: Props) {
  const [sortField, setSortField] = useState<SortField>("marketValue");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(
    new Set()
  );

  // ── Handlers ──
  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  }

  function toggleAccount(id: string) {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleInstitution(institution: string, checked: boolean) {
    const instAccountIds = accounts
      .filter((a) => (a.institution || "Other") === institution)
      .map((a) => a.id);
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      for (const id of instAccountIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function clearFilter() {
    setSelectedAccountIds(new Set());
  }

  // ── Derived data ──

  if (positions.length === 0) {
    return (
      <div className="rounded-lg border p-4 text-sm text-gray-500">
        No positions found.
      </div>
    );
  }

  const showAccountFilter = accounts.length > 1;
  const showAccountColumn =
    accounts.length > 1 && selectedAccountIds.size !== 1;

  // Filter by selected accounts
  const filtered =
    selectedAccountIds.size === 0
      ? positions
      : positions.filter(
          (p) => p.accountId && selectedAccountIds.has(p.accountId)
        );

  const totalMarketValue = filtered.reduce(
    (sum, pos) => sum + pos.marketValue,
    0
  );

  // Sort
  const sorted = useMemo(() => {
    const comparator = (a: UnifiedPosition, b: UnifiedPosition) => {
      let aVal: number | string;
      let bVal: number | string;
      switch (sortField) {
        case "symbol":
          aVal = a.symbol;
          bVal = b.symbol;
          break;
        case "marketValue":
          aVal = a.marketValue;
          bVal = b.marketValue;
          break;
        case "quantity":
          aVal = a.quantity;
          bVal = b.quantity;
          break;
        case "averagePrice":
          aVal = a.averagePrice;
          bVal = b.averagePrice;
          break;
        case "allocationPct":
          aVal =
            totalMarketValue > 0 ? a.marketValue / totalMarketValue : 0;
          bVal =
            totalMarketValue > 0 ? b.marketValue / totalMarketValue : 0;
          break;
        case "dayPnl":
          aVal = a.currentDayProfitLoss;
          bVal = b.currentDayProfitLoss;
          break;
        case "dayPnlPct":
          aVal = a.currentDayProfitLossPercentage;
          bVal = b.currentDayProfitLossPercentage;
          break;
        default:
          aVal = 0;
          bVal = 0;
      }
      if (typeof aVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal);
      }
      return sortDirection === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    };
    return [...filtered].sort(comparator);
  }, [filtered, sortField, sortDirection, totalMarketValue]);

  // Group by display category
  const grouped = useMemo(() => {
    const groups = new Map<DisplayCategoryId, UnifiedPosition[]>();
    for (const pos of sorted) {
      const cat = getDisplayCategory(pos.assetType, pos.description);
      const list = groups.get(cat) ?? [];
      list.push(pos);
      groups.set(cat, list);
    }
    return DISPLAY_CATEGORIES.filter((c) => groups.has(c.id)).map((c) => ({
      ...c,
      positions: groups.get(c.id)!,
    }));
  }, [sorted]);

  // Column count for colSpan on category headers
  let columnCount = 3; // Symbol + Avg Price + Day P&L %
  if (showAccountColumn) columnCount++;
  if (!hideValues) columnCount += 3; // Quantity + Market Value + Day P&L
  columnCount++; // Alloc %

  // ── Sort header props ──
  const sortProps = { sortField, sortDirection, onSort: handleSort };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Positions</h2>
        {showAccountFilter && (
          <AccountFilter
            accounts={accounts.filter((a) => !a.isAggregate)}
            selectedIds={selectedAccountIds}
            onToggle={toggleAccount}
            onToggleInstitution={toggleInstitution}
            onClear={clearFilter}
          />
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <SortableHeader field="symbol" label="Symbol" {...sortProps} />
              {showAccountColumn && (
                <th className="px-2 py-2 font-medium sm:px-4 sm:py-3">
                  Account
                </th>
              )}
              {!hideValues && (
                <SortableHeader
                  field="quantity"
                  label="Quantity"
                  {...sortProps}
                />
              )}
              <SortableHeader
                field="averagePrice"
                label="Avg Price"
                align="right"
                {...sortProps}
              />
              {!hideValues && (
                <SortableHeader
                  field="marketValue"
                  label="Market Value"
                  align="right"
                  {...sortProps}
                />
              )}
              <SortableHeader
                field="allocationPct"
                label="Alloc %"
                align="right"
                {...sortProps}
              />
              {!hideValues && (
                <SortableHeader
                  field="dayPnl"
                  label="Day P&L"
                  align="right"
                  {...sortProps}
                />
              )}
              <SortableHeader
                field="dayPnlPct"
                label="Day P&L %"
                align="right"
                {...sortProps}
              />
            </tr>
          </thead>
          <tbody>
            {grouped.map((group) => (
              <React.Fragment key={group.id}>
                {/* Category header */}
                <tr className="bg-gray-100">
                  <td
                    colSpan={columnCount}
                    className="px-2 py-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wider sm:px-4"
                  >
                    {group.label}{" "}
                    <span className="font-normal text-gray-400">
                      ({group.positions.length})
                    </span>
                  </td>
                </tr>
                {/* Position rows */}
                {group.positions.map((pos, i) => {
                  const plColor =
                    pos.currentDayProfitLoss >= 0
                      ? "text-green-600"
                      : "text-red-600";
                  const allocationPct =
                    totalMarketValue > 0
                      ? (pos.marketValue / totalMarketValue) * 100
                      : 0;
                  return (
                    <tr
                      key={`${pos.accountId}-${pos.symbol}-${i}`}
                      className={cn(
                        "border-b last:border-b-0",
                        i % 2 === 1 && "bg-gray-50/60"
                      )}
                    >
                      {/* Symbol + description */}
                      <td className="px-2 py-2 sm:px-4 sm:py-3">
                        <div className="font-medium">{pos.symbol}</div>
                        {pos.description && (
                          <div className="text-xs text-gray-400 truncate max-w-[120px] sm:max-w-[200px]">
                            {pos.description}
                          </div>
                        )}
                      </td>
                      {/* Account (two-row) */}
                      {showAccountColumn && (
                        <td className="px-2 py-2 sm:px-4 sm:py-3">
                          <div className="text-xs text-gray-700">
                            {pos.accountInstitution ?? "Unknown"}
                          </div>
                          <div className="text-xs text-gray-400">
                            {pos.accountNumber ?? ""}
                          </div>
                        </td>
                      )}
                      {/* Quantity */}
                      {!hideValues && (
                        <td className="px-2 py-2 sm:px-4 sm:py-3 tabular-nums">
                          {pos.quantity}
                        </td>
                      )}
                      {/* Avg Price */}
                      <td className="px-2 py-2 text-right sm:px-4 sm:py-3 tabular-nums">
                        ${pos.averagePrice.toFixed(2)}
                      </td>
                      {/* Market Value */}
                      {!hideValues && (
                        <td className="px-2 py-2 text-right sm:px-4 sm:py-3 tabular-nums">
                          $
                          {pos.marketValue.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      )}
                      {/* Alloc % */}
                      <td className="px-2 py-2 text-right sm:px-4 sm:py-3 tabular-nums">
                        {allocationPct.toFixed(2)}%
                      </td>
                      {/* Day P&L */}
                      {!hideValues && (
                        <td
                          className={`px-2 py-2 text-right sm:px-4 sm:py-3 tabular-nums ${plColor}`}
                        >
                          {pos.currentDayProfitLoss >= 0 ? "+" : ""}$
                          {pos.currentDayProfitLoss.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      )}
                      {/* Day P&L % */}
                      <td
                        className={`px-2 py-2 text-right sm:px-4 sm:py-3 tabular-nums ${plColor}`}
                      >
                        {pos.currentDayProfitLossPercentage >= 0 ? "+" : ""}
                        {pos.currentDayProfitLossPercentage.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
