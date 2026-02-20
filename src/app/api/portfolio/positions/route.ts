import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken, SchwabApiClient } from "@/lib/schwab/client";
import { hasSchwabConnection } from "@/lib/schwab/tokens";
import type { SchwabPosition } from "@/lib/schwab/types";
import type { Holding } from "@/lib/holdings/types";

/**
 * Unified portfolio positions endpoint.
 * Reads from:
 * 1. Schwab API (live positions, if connected)
 * 2. holdings table + accounts table (stored truth)
 *
 * Returns normalized arrays of positions and accounts.
 * Aggregate accounts (is_aggregate=true) are returned separately
 * so the frontend can display them without double-counting.
 */

export interface UnifiedPosition {
  symbol: string;
  description: string;
  assetType: string;
  assetSubtype: string | null;
  quantity: number;
  shortQuantity: number;
  averagePrice: number;
  marketValue: number;
  currentDayProfitLoss: number;
  currentDayProfitLossPercentage: number;
  source: "schwab_api" | "manual_upload" | "manual_entry" | "quiltt" | "offline";
  accountId?: string;
  accountName?: string;
  accountInstitution?: string;
  accountNumber?: string;
  priceDate?: string | null;
}

export interface UnifiedAccount {
  id: string;
  name: string;
  institution: string;
  type: string;
  source: "schwab_api" | "manual_upload" | "manual_entry" | "quiltt" | "offline";
  cashBalance: number;
  liquidationValue: number;
  holdingsCount: number;
  lastSyncedAt: string | null;
  accountGroup: string | null;
  isAggregate: boolean;
  /** Account category: "brokerage", "banking", "credit", "loan", "real_estate", "offline". */
  accountCategory: string;
}

export interface PortfolioDiscrepancy {
  accountId: string;
  accountName: string;
  documentTotal: number;
  computedTotal: number;
  difference: number;
  differencePct: number;
}

export interface PortfolioData {
  positions: UnifiedPosition[];
  accounts: UnifiedAccount[];
  aggregatePositions: UnifiedPosition[];
  aggregateAccounts: UnifiedAccount[];
  hasSchwab: boolean;
  hasUploads: boolean;
  /** Discrepancies between document-reported and computed account totals. */
  discrepancies?: PortfolioDiscrepancy[];
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const positions: UnifiedPosition[] = [];
  const accounts: UnifiedAccount[] = [];
  const aggregatePositions: UnifiedPosition[] = [];
  const aggregateAccounts: UnifiedAccount[] = [];
  let hasSchwab = false;
  let hasUploads = false;

  // ── 1. Schwab API positions (if connected) ──
  try {
    const isConnected = await hasSchwabConnection(supabase, user.id);
    if (isConnected) {
      hasSchwab = true;
      const accessToken = await getValidAccessToken(supabase, user.id);
      const client = new SchwabApiClient(accessToken);
      const schwabAccounts = await client.getAccounts("positions");

      for (const acct of schwabAccounts) {
        const sec = acct.securitiesAccount;
        const bal = sec.currentBalances;

        accounts.push({
          id: `schwab_${sec.accountNumber}`,
          name: `****${sec.accountNumber.slice(-4)}`,
          institution: "Charles Schwab",
          type: sec.type,
          source: "schwab_api",
          cashBalance: bal?.cashBalance ?? 0,
          liquidationValue:
            bal?.liquidationValue ??
            acct.aggregatedBalance?.liquidationValue ??
            0,
          holdingsCount: sec.positions?.length ?? 0,
          lastSyncedAt: new Date().toISOString(),
          accountGroup: null,
          isAggregate: false,
          accountCategory: "brokerage",
        });

        const maskedNumber = `****${sec.accountNumber.slice(-4)}`;
        for (const pos of sec.positions ?? []) {
          positions.push(
            schwabToUnified(
              pos,
              `schwab_${sec.accountNumber}`,
              `Schwab ${maskedNumber}`,
              "Charles Schwab",
              maskedNumber
            )
          );
        }
      }
    }
  } catch (err) {
    // Schwab fetch failed — continue with stored data
    console.error("Schwab API fetch failed:", err);
  }

  // ── 2. Stored holdings + accounts (non-Schwab) ──
  try {
    // Get all user accounts that aren't Schwab API (to avoid double-counting)
    const { data: dbAccounts } = await supabase
      .from("accounts")
      .select(
        "id, account_nickname, institution_name, account_type, data_source, " +
        "total_market_value, cash_balance, equity_value, buying_power, " +
        "holdings_count, last_synced_at, account_category, account_group, is_aggregate, " +
        "document_reported_total"
      )
      .eq("user_id", user.id)
      .neq("data_source", "schwab_api") as { data: Array<{
        id: string;
        account_nickname: string | null;
        institution_name: string | null;
        account_type: string | null;
        data_source: string;
        total_market_value: number | null;
        cash_balance: number | null;
        equity_value: number | null;
        buying_power: number | null;
        holdings_count: number | null;
        last_synced_at: string | null;
        account_category: string;
        account_group: string | null;
        is_aggregate: boolean;
        document_reported_total: number | null;
      }> | null };

    if (dbAccounts && dbAccounts.length > 0) {
      hasUploads = true;

      // Split accounts into regular and aggregate
      const regularAccounts = dbAccounts.filter((a) => !a.is_aggregate);
      const aggAccounts = dbAccounts.filter((a) => a.is_aggregate);

      // Fetch all active holdings for regular accounts in one query
      const regularIds = regularAccounts.map((a) => a.id);
      const { data: regularHoldings } = regularIds.length > 0
        ? await supabase
            .from("holdings")
            .select("*")
            .in("account_id", regularIds)
            .gt("quantity", 0) as { data: Holding[] | null }
        : { data: [] as Holding[] };

      // Fetch aggregate account holdings separately
      const aggIds = aggAccounts.map((a) => a.id);
      const { data: aggHoldings } = aggIds.length > 0
        ? await supabase
            .from("holdings")
            .select("*")
            .in("account_id", aggIds)
            .gt("quantity", 0) as { data: Holding[] | null }
        : { data: [] as Holding[] };

      // Group holdings by account
      const holdingsByAccount = new Map<string, Holding[]>();
      for (const h of [...(regularHoldings ?? []), ...(aggHoldings ?? [])]) {
        const list = holdingsByAccount.get(h.account_id) ?? [];
        list.push(h);
        holdingsByAccount.set(h.account_id, list);
      }

      // Process regular accounts
      for (const acct of regularAccounts) {
        const accountLabel =
          acct.account_nickname ?? acct.institution_name ?? "Uploaded Account";

        // Use Number() without || 0 for liquidationValue so negatives are preserved
        const liqVal = Number(acct.total_market_value);
        accounts.push({
          id: acct.id,
          name: accountLabel,
          institution: acct.institution_name ?? "Unknown",
          type: acct.account_type ?? "Unknown",
          source: acct.data_source as UnifiedAccount["source"],
          cashBalance: Number(acct.cash_balance) || 0,
          liquidationValue: isNaN(liqVal) ? 0 : liqVal,
          holdingsCount: acct.holdings_count ?? 0,
          lastSyncedAt: acct.last_synced_at ?? null,
          accountGroup: acct.account_group ?? null,
          isAggregate: false,
          accountCategory: acct.account_category ?? "brokerage",
        });

        const acctHoldings = holdingsByAccount.get(acct.id) ?? [];
        for (const h of acctHoldings) {
          const sym = h.symbol ?? h.name ?? "UNKNOWN";
          positions.push({
            symbol: sym || "UNKNOWN",
            description: h.description ?? "",
            assetType: h.asset_type ?? "EQUITY",
            assetSubtype: h.asset_subtype ?? null,
            quantity: safeNum(h.quantity),
            shortQuantity: safeNum(h.short_quantity),
            averagePrice: safeNum(h.purchase_price),
            marketValue: safeNum(h.market_value),
            currentDayProfitLoss: safeNum(h.day_profit_loss),
            currentDayProfitLossPercentage: safeNum(h.day_profit_loss_pct),
            source: acct.data_source as UnifiedPosition["source"],
            accountId: acct.id,
            accountName: accountLabel,
            accountInstitution: acct.institution_name ?? "Unknown",
            accountNumber: acct.account_nickname ?? "",
            priceDate: h.valuation_date ?? null,
          });
        }
      }

      // Process aggregate accounts
      for (const acct of aggAccounts) {
        const accountLabel =
          acct.account_nickname ?? acct.institution_name ?? "Aggregate";

        const aggLiqVal = Number(acct.total_market_value);
        aggregateAccounts.push({
          id: acct.id,
          name: accountLabel,
          institution: acct.institution_name ?? "Unknown",
          type: acct.account_type ?? "aggregate",
          source: acct.data_source as UnifiedAccount["source"],
          cashBalance: Number(acct.cash_balance) || 0,
          liquidationValue: isNaN(aggLiqVal) ? 0 : aggLiqVal,
          holdingsCount: acct.holdings_count ?? 0,
          lastSyncedAt: acct.last_synced_at ?? null,
          accountGroup: acct.account_group ?? null,
          isAggregate: true,
          accountCategory: acct.account_category ?? "brokerage",
        });

        const acctHoldings = holdingsByAccount.get(acct.id) ?? [];
        for (const h of acctHoldings) {
          const sym = h.symbol ?? h.name ?? "UNKNOWN";
          aggregatePositions.push({
            symbol: sym || "UNKNOWN",
            description: h.description ?? "",
            assetType: h.asset_type ?? "EQUITY",
            assetSubtype: h.asset_subtype ?? null,
            quantity: safeNum(h.quantity),
            shortQuantity: safeNum(h.short_quantity),
            averagePrice: safeNum(h.purchase_price),
            marketValue: safeNum(h.market_value),
            currentDayProfitLoss: safeNum(h.day_profit_loss),
            currentDayProfitLossPercentage: safeNum(h.day_profit_loss_pct),
            source: acct.data_source as UnifiedPosition["source"],
            accountId: acct.id,
            accountName: accountLabel,
            accountInstitution: acct.institution_name ?? "Unknown",
            accountNumber: acct.account_nickname ?? "",
            priceDate: h.valuation_date ?? null,
          });
        }
      }
    }
  } catch (err) {
    console.error("Holdings data fetch failed:", err);
  }

  // Merge aggregate positions into primary when individual accounts don't have
  // their own holdings. This happens when an uploaded statement puts all positions
  // as "unallocated" — they end up in the aggregate account while individual
  // accounts only have cash/balance data. Without merging, the dashboard shows
  // only cash and ignores the actual equity positions.
  if (aggregatePositions.length > 0 && positions.length === 0) {
    positions.push(...aggregatePositions);
    aggregatePositions.length = 0;

    // Zero out brokerage account cashBalance to prevent double-counting with
    // aggregate positions (which include cash-equivalent holdings like SNOXX).
    // Keep liquidationValue intact so the Accounts tab shows correct per-account
    // totals. Non-brokerage accounts (banking, credit, loans, real estate) keep
    // their cashBalance since they aren't represented in aggregate positions.
    const BROKERAGE_CATEGORIES = new Set(["brokerage"]);
    for (const acct of accounts) {
      if (BROKERAGE_CATEGORIES.has(acct.accountCategory)) {
        acct.cashBalance = 0;
      }
    }

    // Don't merge aggregate accounts into the primary list — they would
    // duplicate values that are already counted via individual accounts.
    aggregateAccounts.length = 0;
  }

  // ── Compute integrity discrepancies ──
  const discrepancies: PortfolioDiscrepancy[] = [];
  // Re-read accounts with document_reported_total (we already have them in the accounts array
  // but need the doc total which was queried above). Match by ID.
  if (hasUploads) {
    // Build a lookup from our already-fetched DB data
    // We need to check the dbAccounts from the stored data query
    // The accounts array already has the computed liquidationValue,
    // so we compare document_reported_total against it.
    try {
      const { data: acctTotals } = await supabase
        .from("accounts")
        .select("id, account_nickname, document_reported_total, total_market_value")
        .eq("user_id", user.id)
        .not("document_reported_total", "is", null) as { data: Array<{
          id: string;
          account_nickname: string | null;
          document_reported_total: number;
          total_market_value: number | null;
        }> | null };

      for (const acct of acctTotals ?? []) {
        const docTotal = Number(acct.document_reported_total);
        const computed = Number(acct.total_market_value) || 0;
        const diff = docTotal - computed;
        const absDiff = Math.abs(diff);
        const pctDiff = docTotal !== 0 ? (absDiff / Math.abs(docTotal)) * 100 : 0;

        if (absDiff > 100 && pctDiff > 1) {
          discrepancies.push({
            accountId: acct.id,
            accountName: acct.account_nickname ?? "Unknown Account",
            documentTotal: docTotal,
            computedTotal: computed,
            difference: diff,
            differencePct: pctDiff,
          });
        }
      }
    } catch {
      // Ignore discrepancy check failures
    }
  }

  const body: PortfolioData = {
    positions,
    accounts,
    aggregatePositions,
    aggregateAccounts,
    hasSchwab,
    hasUploads,
    ...(discrepancies.length > 0 ? { discrepancies } : {}),
  };
  return NextResponse.json(body);
}

// ── Helpers ──

/** Convert a DB value to a safe number (never NaN). */
function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function schwabToUnified(
  pos: SchwabPosition,
  accountId: string,
  accountName: string,
  accountInstitution: string,
  accountNumber: string
): UnifiedPosition {
  return {
    symbol: pos.instrument.symbol,
    description: pos.instrument.description ?? "",
    assetType: pos.instrument.assetType,
    assetSubtype: null,
    quantity: pos.longQuantity,
    shortQuantity: pos.shortQuantity,
    averagePrice: pos.averagePrice,
    marketValue: pos.marketValue,
    currentDayProfitLoss: pos.currentDayProfitLoss,
    currentDayProfitLossPercentage: pos.currentDayProfitLossPercentage,
    source: "schwab_api",
    accountId,
    accountName,
    accountInstitution,
    accountNumber,
    priceDate: new Date().toISOString().slice(0, 10),
  };
}
