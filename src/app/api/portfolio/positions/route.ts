import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken, SchwabApiClient } from "@/lib/schwab/client";
import { hasSchwabConnection } from "@/lib/schwab/tokens";
import type { SchwabPosition } from "@/lib/schwab/types";

/**
 * Unified portfolio positions endpoint.
 * Merges data from:
 * 1. Schwab API (live positions, if connected)
 * 2. Uploaded position_snapshots from DB (latest snapshot per account)
 *
 * Returns a normalized array of position objects.
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
  source: "schwab_api" | "manual_upload" | "manual_entry";
  accountId?: string;
  accountName?: string;
}

export interface UnifiedAccount {
  id: string;
  name: string;
  institution: string;
  type: string;
  source: "schwab_api" | "manual_upload" | "manual_entry";
  cashBalance: number;
  liquidationValue: number;
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
        });

        for (const pos of sec.positions ?? []) {
          positions.push(schwabToUnified(pos, `schwab_${sec.accountNumber}`, `Schwab ****${sec.accountNumber.slice(-4)}`));
        }
      }
    }
  } catch (err) {
    // Schwab fetch failed — continue with upload data
    console.error("Schwab API fetch failed:", err);
  }

  // ── 2. Uploaded position snapshots (latest per account) ──
  try {
    // Get all user accounts that aren't Schwab API (to avoid double-counting)
    const { data: dbAccounts } = await supabase
      .from("accounts")
      .select("id, account_nickname, institution_name, account_type, data_source")
      .eq("user_id", user.id)
      .neq("data_source", "schwab_api");

    if (dbAccounts && dbAccounts.length > 0) {
      hasUploads = true;

      for (const acct of dbAccounts) {
        // Get the latest snapshot date for this account
        const { data: latestSnapshot } = await supabase
          .from("position_snapshots")
          .select("snapshot_date")
          .eq("account_id", acct.id)
          .order("snapshot_date", { ascending: false })
          .limit(1);

        if (!latestSnapshot || latestSnapshot.length === 0) continue;

        const latestDate = latestSnapshot[0].snapshot_date;

        // Get all positions for that snapshot date
        const { data: snapshotPositions } = await supabase
          .from("position_snapshots")
          .select("*")
          .eq("account_id", acct.id)
          .eq("snapshot_date", latestDate);

        if (!snapshotPositions) continue;

        // Get balance for this account/date
        const { data: balances } = await supabase
          .from("balance_snapshots")
          .select("*")
          .eq("account_id", acct.id)
          .order("snapshot_date", { ascending: false })
          .limit(1);

        const bal = balances?.[0];
        const accountLabel = acct.account_nickname ?? acct.institution_name ?? "Uploaded Account";

        accounts.push({
          id: acct.id,
          name: accountLabel,
          institution: acct.institution_name ?? "Unknown",
          type: acct.account_type ?? "Unknown",
          source: acct.data_source as "manual_upload" | "manual_entry",
          cashBalance: bal?.cash_balance ?? 0,
          liquidationValue: bal?.liquidation_value ?? 0,
        });

        for (const sp of snapshotPositions) {
          positions.push({
            symbol: sp.symbol,
            description: sp.description ?? "",
            assetType: sp.asset_type ?? "EQUITY",
            quantity: Number(sp.quantity) ?? 0,
            shortQuantity: Number(sp.short_quantity) ?? 0,
            averagePrice: Number(sp.average_cost_basis) ?? 0,
            marketValue: Number(sp.market_value) ?? 0,
            currentDayProfitLoss: Number(sp.day_profit_loss) ?? 0,
            currentDayProfitLossPercentage: Number(sp.day_profit_loss_pct) ?? 0,
            source: acct.data_source as "manual_upload" | "manual_entry",
            accountId: acct.id,
            accountName: accountLabel,
          });
        }
      }
    }
  } catch (err) {
    console.error("Upload data fetch failed:", err);
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
