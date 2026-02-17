import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedPosition } from "@/lib/upload/types";
import type { Holding, ReconciliationChange } from "./types";

/**
 * Reconcile incoming positions against existing holdings for an account.
 *
 * 1. Fetches current holdings for the account.
 * 2. For each incoming position:
 *    - New symbol → insert holding, record 'new_position'
 *    - Existing symbol with changed qty/value → upsert, record change
 * 3. If incoming data is a full snapshot (has positions), any existing holding
 *    NOT in the incoming set is marked as closed (quantity=0).
 * 4. Returns all changes detected.
 */
export async function reconcileHoldings(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  incomingPositions: ExtractedPosition[],
  statementId: string
): Promise<{
  changes: ReconciliationChange[];
  upserted: number;
  closed: number;
}> {
  const changes: ReconciliationChange[] = [];
  let upserted = 0;
  let closed = 0;

  // 1. Fetch current holdings for this account
  const { data: existingHoldings } = await supabase
    .from("holdings")
    .select("*")
    .eq("account_id", accountId);

  const holdingsBySymbol = new Map<string, Holding>();
  for (const h of (existingHoldings ?? []) as Holding[]) {
    if (h.symbol) {
      holdingsBySymbol.set(h.symbol, h);
    }
  }

  // 2. Deduplicate incoming positions by symbol (same logic as data-writer)
  const incomingMap = new Map<string, ExtractedPosition>();
  for (const p of incomingPositions) {
    const key = p.symbol;
    const existing = incomingMap.get(key);
    if (existing) {
      existing.quantity += p.quantity;
      if (p.market_value != null) {
        existing.market_value = (existing.market_value ?? 0) + p.market_value;
      }
      if (p.cost_basis_total != null) {
        existing.cost_basis_total =
          (existing.cost_basis_total ?? 0) + p.cost_basis_total;
      }
      if (p.unrealized_profit_loss != null) {
        existing.unrealized_profit_loss =
          (existing.unrealized_profit_loss ?? 0) + p.unrealized_profit_loss;
      }
      if (p.market_price_per_share != null) {
        existing.market_price_per_share = p.market_price_per_share;
      }
      if (p.average_cost_basis != null) {
        existing.average_cost_basis = p.average_cost_basis;
      }
    } else {
      incomingMap.set(key, { ...p });
    }
  }

  // 3. Process each incoming position
  const incomingSymbols = new Set<string>();

  for (const [symbol, pos] of incomingMap) {
    incomingSymbols.add(symbol);
    const existing = holdingsBySymbol.get(symbol);
    const incomingQty = pos.quantity;
    const incomingMV = pos.market_value ?? null;

    if (!existing) {
      // New position
      changes.push({
        type: "new_position",
        symbol,
        name: symbol,
        accountId,
        current: { quantity: incomingQty, market_value: incomingMV },
      });
    } else if (Number(existing.quantity) !== incomingQty) {
      // Quantity changed
      changes.push({
        type: "quantity_change",
        symbol,
        name: existing.name,
        accountId,
        previous: {
          quantity: Number(existing.quantity),
          market_value: existing.market_value,
        },
        current: { quantity: incomingQty, market_value: incomingMV },
      });
    } else if (
      existing.market_value !== incomingMV &&
      incomingMV !== null
    ) {
      // Value update (same qty, different market value)
      changes.push({
        type: "value_update",
        symbol,
        name: existing.name,
        accountId,
        previous: {
          quantity: Number(existing.quantity),
          market_value: existing.market_value,
        },
        current: { quantity: incomingQty, market_value: incomingMV },
      });
    }

    // Upsert the holding
    const { error } = await supabase.from("holdings").upsert(
      {
        user_id: userId,
        account_id: accountId,
        symbol,
        name: symbol,
        cusip: pos.cusip ?? null,
        asset_type: pos.asset_type ?? "EQUITY",
        asset_category: "tradeable",
        description: pos.description ?? null,
        quantity: pos.quantity,
        short_quantity: pos.short_quantity ?? 0,
        quantity_unit: "shares",
        purchase_price: pos.average_cost_basis ?? null,
        cost_basis_total: pos.cost_basis_total ?? null,
        current_price: pos.market_price_per_share ?? null,
        market_value: pos.market_value ?? null,
        valuation_date: pos.snapshot_date,
        valuation_source: "statement",
        day_profit_loss: null,
        day_profit_loss_pct: null,
        unrealized_profit_loss: pos.unrealized_profit_loss ?? null,
        unrealized_profit_loss_pct: pos.unrealized_profit_loss_pct ?? null,
        data_source: "manual_upload",
        last_updated_from: `upload:${statementId}`,
      },
      { onConflict: "idx_holdings_account_asset" }
    );

    if (error) {
      console.error(`Failed to upsert holding ${symbol}:`, error.message);
    } else {
      upserted++;
    }
  }

  // 4. Detect closed positions — existing holdings not in incoming data
  // Only do this if the incoming data represents a full account snapshot
  if (incomingPositions.length > 0) {
    for (const [symbol, existing] of holdingsBySymbol) {
      if (!incomingSymbols.has(symbol) && Number(existing.quantity) > 0) {
        changes.push({
          type: "closed_position",
          symbol,
          name: existing.name,
          accountId,
          previous: {
            quantity: Number(existing.quantity),
            market_value: existing.market_value,
          },
          current: { quantity: 0, market_value: 0 },
        });

        // Set quantity to 0 (keep row for audit trail)
        await supabase
          .from("holdings")
          .update({
            quantity: 0,
            short_quantity: 0,
            market_value: 0,
            last_updated_from: `upload:${statementId}`,
          })
          .eq("id", existing.id);

        closed++;
      }
    }
  }

  return { changes, upserted, closed };
}
