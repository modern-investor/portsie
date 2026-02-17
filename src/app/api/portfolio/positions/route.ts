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
 */

export interface UnifiedPosition {
  symbol: string;
  description: string;
  assetType: string;
  quantity: number;
  shortQuantity: number;
  averagePrice: number;
  marketValue: number;
  currentDayProfitLoss: number;
  currentDayProfitLossPercentage: number;
  source: "schwab_api" | "manual_upload" | "manual_entry" | "quiltt" | "offline";
  accountId?: string;
  accountName?: string;
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
}

export interface PortfolioData {
  positions: UnifiedPosition[];
  accounts: UnifiedAccount[];
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
        });

        for (const pos of sec.positions ?? []) {
          positions.push(
            schwabToUnified(
              pos,
              `schwab_${sec.accountNumber}`,
              `Schwab ****${sec.accountNumber.slice(-4)}`
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
        "holdings_count, last_synced_at, account_category"
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
      }> | null };

    if (dbAccounts && dbAccounts.length > 0) {
      hasUploads = true;

      // Fetch all active holdings for these accounts in one query
      const accountIds = dbAccounts.map((a) => a.id);
      const { data: allHoldings } = await supabase
        .from("holdings")
        .select("*")
        .in("account_id", accountIds)
        .gt("quantity", 0) as { data: Holding[] | null };

      // Group holdings by account
      const holdingsByAccount = new Map<string, Holding[]>();
      for (const h of allHoldings ?? []) {
        const list = holdingsByAccount.get(h.account_id) ?? [];
        list.push(h);
        holdingsByAccount.set(h.account_id, list);
      }

      for (const acct of dbAccounts) {
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
        });

        const acctHoldings = holdingsByAccount.get(acct.id) ?? [];
        for (const h of acctHoldings) {
          positions.push({
            symbol: h.symbol ?? h.name,
            description: h.description ?? "",
            assetType: h.asset_type ?? "EQUITY",
            quantity: Number(h.quantity) || 0,
            shortQuantity: Number(h.short_quantity) || 0,
            averagePrice: Number(h.purchase_price) || 0,
            marketValue: Number(h.market_value) || 0,
            currentDayProfitLoss: Number(h.day_profit_loss) || 0,
            currentDayProfitLossPercentage: Number(h.day_profit_loss_pct) || 0,
            source: acct.data_source as UnifiedPosition["source"],
            accountId: acct.id,
            accountName: accountLabel,
          });
        }
      }
    }
  } catch (err) {
    console.error("Holdings data fetch failed:", err);
  }

  const body: PortfolioData = { positions, accounts, hasSchwab, hasUploads };
  return NextResponse.json(body);
}

// ── Helpers ──

function schwabToUnified(
  pos: SchwabPosition,
  accountId: string,
  accountName: string
): UnifiedPosition {
  return {
    symbol: pos.instrument.symbol,
    description: pos.instrument.description ?? "",
    assetType: pos.instrument.assetType,
    quantity: pos.longQuantity,
    shortQuantity: pos.shortQuantity,
    averagePrice: pos.averagePrice,
    marketValue: pos.marketValue,
    currentDayProfitLoss: pos.currentDayProfitLoss,
    currentDayProfitLossPercentage: pos.currentDayProfitLossPercentage,
    source: "schwab_api",
    accountId,
    accountName,
  };
}
