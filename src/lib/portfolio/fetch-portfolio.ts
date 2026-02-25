/**
 * Shared portfolio assembly module.
 * Single source of truth for fetching + normalizing portfolio data.
 *
 * Used by:
 * - GET /api/portfolio/positions (dashboard display)
 * - POST /api/portfolio/ai-views/generate (AI view generation)
 */

import { getValidAccessToken, SchwabApiClient } from "@/lib/schwab/client";
import { hasSchwabConnection } from "@/lib/schwab/tokens";
import type { SchwabPosition } from "@/lib/schwab/types";
import type { Holding } from "@/lib/holdings/types";
import type {
  PortfolioData,
  UnifiedPosition,
  UnifiedAccount,
  PortfolioDiscrepancy,
} from "@/app/api/portfolio/positions/route";

type SupabaseClient = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

/**
 * Assemble the full portfolio for a user.
 * Includes Schwab live data, stored holdings, market price enrichment,
 * aggregate merge logic, and discrepancy computation.
 */
export async function assemblePortfolio(
  supabase: SupabaseClient,
  userId: string
): Promise<PortfolioData> {
  const positions: UnifiedPosition[] = [];
  const accounts: UnifiedAccount[] = [];
  const aggregatePositions: UnifiedPosition[] = [];
  const aggregateAccounts: UnifiedAccount[] = [];
  let hasSchwab = false;
  let hasUploads = false;

  // ── 1. Schwab API positions (if connected) ──
  try {
    const isConnected = await hasSchwabConnection(supabase, userId);
    if (isConnected) {
      hasSchwab = true;
      const accessToken = await getValidAccessToken(supabase, userId);
      const client = new SchwabApiClient(accessToken);
      const schwabAccounts = await client.getAccounts("positions");

      for (const acct of schwabAccounts) {
        const sec = acct.securitiesAccount;
        const bal = sec.currentBalances;

        const acctPositions: UnifiedPosition[] = [];
        const maskedNumber = `****${sec.accountNumber.slice(-4)}`;
        for (const pos of sec.positions ?? []) {
          acctPositions.push(
            schwabToUnified(
              pos,
              `schwab_${sec.accountNumber}`,
              `Schwab ${maskedNumber}`,
              "Charles Schwab",
              maskedNumber
            )
          );
        }
        positions.push(...acctPositions);

        const cashBalance = bal?.cashBalance ?? 0;
        const positionsTotal = acctPositions.reduce(
          (sum, p) => sum + p.marketValue,
          0
        );
        const computedLiquidation = positionsTotal + cashBalance;

        const liquidationValue =
          acctPositions.length > 0
            ? computedLiquidation
            : bal?.liquidationValue ??
              acct.aggregatedBalance?.liquidationValue ??
              cashBalance;

        accounts.push({
          id: `schwab_${sec.accountNumber}`,
          name: `****${sec.accountNumber.slice(-4)}`,
          institution: "Charles Schwab",
          type: sec.type,
          source: "schwab_api",
          cashBalance,
          liquidationValue,
          holdingsCount: acctPositions.length,
          lastSyncedAt: new Date().toISOString(),
          accountGroup: null,
          isAggregate: false,
          accountCategory: schwabAccountCategory(sec.type),
        });
      }
    }
  } catch (err) {
    console.error("Schwab API fetch failed:", err);
  }

  // ── 2. Stored holdings + accounts (non-Schwab) ──
  try {
    const { data: dbAccounts } = await supabase
      .from("accounts")
      .select(
        "id, account_nickname, institution_name, account_type, data_source, " +
        "total_market_value, cash_balance, equity_value, buying_power, " +
        "holdings_count, last_synced_at, account_category, account_group, is_aggregate, " +
        "document_reported_total"
      )
      .eq("user_id", userId)
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

      const regularAccounts = dbAccounts.filter((a) => !a.is_aggregate);
      const aggAccounts = dbAccounts.filter((a) => a.is_aggregate);

      const regularIds = regularAccounts.map((a) => a.id);
      const { data: regularHoldings } = regularIds.length > 0
        ? await supabase
            .from("holdings")
            .select("*")
            .in("account_id", regularIds)
            .gt("quantity", 0) as { data: Holding[] | null }
        : { data: [] as Holding[] };

      const aggIds = aggAccounts.map((a) => a.id);
      const { data: aggHoldings } = aggIds.length > 0
        ? await supabase
            .from("holdings")
            .select("*")
            .in("account_id", aggIds)
            .gt("quantity", 0) as { data: Holding[] | null }
        : { data: [] as Holding[] };

      const holdingsByAccount = new Map<string, Holding[]>();
      for (const h of [...(regularHoldings ?? []), ...(aggHoldings ?? [])]) {
        const list = holdingsByAccount.get(h.account_id) ?? [];
        list.push(h);
        holdingsByAccount.set(h.account_id, list);
      }

      for (const acct of regularAccounts) {
        const accountLabel =
          acct.account_nickname ?? acct.institution_name ?? "Uploaded Account";
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

  // ── 3. Enrich with cached market prices (no external API calls) ──
  try {
    const allSymbols = [
      ...new Set([
        ...positions.map((p) => p.symbol),
        ...aggregatePositions.map((p) => p.symbol),
      ]),
    ].filter((s) => s && s !== "UNKNOWN" && s !== "CASH");

    if (allSymbols.length > 0) {
      const { data: cachedPrices } = await supabase
        .from("market_prices")
        .select("symbol, close_price, price_date")
        .in("symbol", allSymbols)
        .order("price_date", { ascending: false });

      if (cachedPrices && cachedPrices.length > 0) {
        const latestPrices = new Map<string, { price: number; date: string }>();
        for (const p of cachedPrices) {
          if (!latestPrices.has(p.symbol)) {
            latestPrices.set(p.symbol, {
              price: Number(p.close_price),
              date: p.price_date,
            });
          }
        }

        const enrichPositions = (arr: UnifiedPosition[]) => {
          for (const pos of arr) {
            const cached = latestPrices.get(pos.symbol);
            if (!cached || cached.price <= 0) continue;
            if (!pos.priceDate || cached.date > pos.priceDate) {
              pos.marketValue = pos.quantity * cached.price;
              pos.priceDate = cached.date;
            }
          }
        };
        enrichPositions(positions);
        enrichPositions(aggregatePositions);
      }
    }
  } catch {
    // Market price enrichment is best-effort
  }

  // ── 4. Merge aggregate positions when individual accounts are empty ──
  if (aggregatePositions.length > 0 && positions.length === 0) {
    positions.push(...aggregatePositions);
    aggregatePositions.length = 0;

    const BROKERAGE_CATEGORIES = new Set(["brokerage"]);
    for (const acct of accounts) {
      if (BROKERAGE_CATEGORIES.has(acct.accountCategory)) {
        acct.cashBalance = 0;
      }
    }
    aggregateAccounts.length = 0;
  }

  // ── 5. Compute integrity discrepancies ──
  const discrepancies: PortfolioDiscrepancy[] = [];
  if (hasUploads) {
    try {
      const { data: acctTotals } = await supabase
        .from("accounts")
        .select("id, account_nickname, document_reported_total, total_market_value")
        .eq("user_id", userId)
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

  return {
    positions,
    accounts,
    aggregatePositions,
    aggregateAccounts,
    hasSchwab,
    hasUploads,
    ...(discrepancies.length > 0 ? { discrepancies } : {}),
  };
}

// ── Helpers ──

function schwabAccountCategory(schwabType: string): string {
  const t = schwabType.toUpperCase();
  if (t === "CASH" || t === "CHECKING" || t === "SAVINGS") return "banking";
  return "brokerage";
}

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
    quantity: safeNum(pos.longQuantity),
    shortQuantity: safeNum(pos.shortQuantity),
    averagePrice: safeNum(pos.averagePrice),
    marketValue: safeNum(pos.marketValue),
    currentDayProfitLoss: safeNum(pos.currentDayProfitLoss),
    currentDayProfitLossPercentage: safeNum(pos.currentDayProfitLossPercentage),
    source: "schwab_api",
    accountId,
    accountName,
    accountInstitution,
    accountNumber,
    priceDate: new Date().toISOString().slice(0, 10),
  };
}
