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
}

export interface PortfolioData {
  positions: UnifiedPosition[];
  accounts: UnifiedAccount[];
  aggregatePositions: UnifiedPosition[];
  aggregateAccounts: UnifiedAccount[];
  hasSchwab: boolean;
  hasUploads: boolean;
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
        "holdings_count, last_synced_at, account_category, account_group, is_aggregate"
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

        accounts.push({
          id: acct.id,
          name: accountLabel,
          institution: acct.institution_name ?? "Unknown",
          type: acct.account_type ?? "Unknown",
          source: acct.data_source as UnifiedAccount["source"],
          cashBalance: Number(acct.cash_balance) || 0,
          liquidationValue: Number(acct.total_market_value) || 0,
          holdingsCount: acct.holdings_count ?? 0,
          lastSyncedAt: acct.last_synced_at ?? null,
          accountGroup: acct.account_group ?? null,
          isAggregate: false,
        });

        const acctHoldings = holdingsByAccount.get(acct.id) ?? [];
        for (const h of acctHoldings) {
          positions.push({
            symbol: h.symbol ?? h.name,
            description: h.description ?? "",
            assetType: h.asset_type ?? "EQUITY",
            assetSubtype: h.asset_subtype ?? null,
            quantity: Number(h.quantity) || 0,
            shortQuantity: Number(h.short_quantity) || 0,
            averagePrice: Number(h.purchase_price) || 0,
            marketValue: Number(h.market_value) || 0,
            currentDayProfitLoss: Number(h.day_profit_loss) || 0,
            currentDayProfitLossPercentage: Number(h.day_profit_loss_pct) || 0,
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

        aggregateAccounts.push({
          id: acct.id,
          name: accountLabel,
          institution: acct.institution_name ?? "Unknown",
          type: acct.account_type ?? "aggregate",
          source: acct.data_source as UnifiedAccount["source"],
          cashBalance: Number(acct.cash_balance) || 0,
          liquidationValue: Number(acct.total_market_value) || 0,
          holdingsCount: acct.holdings_count ?? 0,
          lastSyncedAt: acct.last_synced_at ?? null,
          accountGroup: acct.account_group ?? null,
          isAggregate: true,
        });

        const acctHoldings = holdingsByAccount.get(acct.id) ?? [];
        for (const h of acctHoldings) {
          aggregatePositions.push({
            symbol: h.symbol ?? h.name,
            description: h.description ?? "",
            assetType: h.asset_type ?? "EQUITY",
            assetSubtype: h.asset_subtype ?? null,
            quantity: Number(h.quantity) || 0,
            shortQuantity: Number(h.short_quantity) || 0,
            averagePrice: Number(h.purchase_price) || 0,
            marketValue: Number(h.market_value) || 0,
            currentDayProfitLoss: Number(h.day_profit_loss) || 0,
            currentDayProfitLossPercentage: Number(h.day_profit_loss_pct) || 0,
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

    // Zero out individual account cash/liquidation to prevent double-counting.
    // The aggregate positions already represent the full portfolio value
    // (including cash-equivalent positions like SNOXX). Without this, the
    // classify step would add individual account cash on top of position values.
    for (const acct of accounts) {
      acct.cashBalance = 0;
      acct.liquidationValue = 0;
    }

    // Add the aggregate account so its cash (if any) is counted once.
    accounts.push(...aggregateAccounts);
    aggregateAccounts.length = 0;
  }

  const body: PortfolioData = {
    positions,
    accounts,
    aggregatePositions,
    aggregateAccounts,
    hasSchwab,
    hasUploads,
  };
  return NextResponse.json(body);
}

// ── Helpers ──

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
