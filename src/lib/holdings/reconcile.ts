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
 *
 * Uses batched DB writes: one bulk INSERT for new holdings, parallel UPDATEs
 * for existing holdings, and one bulk UPDATE for closed positions.
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

  // 3. Classify each incoming position as new or update
  const incomingSymbols = new Set<string>();
  const newHoldingRows: Record<string, unknown>[] = [];
  const updateOps: { id: string; data: Record<string, unknown> }[] = [];

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

    const holdingData = {
      user_id: userId,
      account_id: accountId,
      symbol,
      name: symbol,
      cusip: pos.cusip ?? null,
      asset_type: pos.asset_type ?? "EQUITY",
      asset_subtype: pos.asset_subtype ?? null,
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
      day_profit_loss: pos.day_change_amount ?? null,
      day_profit_loss_pct: pos.day_change_pct ?? null,
      unrealized_profit_loss: pos.unrealized_profit_loss ?? null,
      unrealized_profit_loss_pct: pos.unrealized_profit_loss_pct ?? null,
      data_source: "manual_upload",
      last_updated_from: `upload:${statementId}`,
    };

    if (existing) {
      updateOps.push({ id: existing.id, data: holdingData });
    } else {
      newHoldingRows.push(holdingData);
    }
  }

  // 4. Batch INSERT all new holdings (1 query instead of N)
  if (newHoldingRows.length > 0) {
    const { error } = await supabase.from("holdings").insert(newHoldingRows);
    if (error) {
      console.error(`Failed to batch insert ${newHoldingRows.length} holdings:`, error.message);
    } else {
      upserted += newHoldingRows.length;
    }
  }

  // 5. Parallel UPDATE existing holdings (concurrent but limited)
  if (updateOps.length > 0) {
    const CONCURRENCY = 10;
    for (let i = 0; i < updateOps.length; i += CONCURRENCY) {
      const batch = updateOps.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(({ id, data }) =>
          supabase.from("holdings").update(data).eq("id", id)
        )
      );
      for (const { error } of results) {
        if (error) {
          console.error("Failed to update holding:", error.message);
        } else {
          upserted++;
        }
      }
    }
  }

  // 6. Batch close positions not in incoming data (1 query using .in())
  if (incomingPositions.length > 0) {
    const closedIds: string[] = [];
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
        closedIds.push(existing.id);
      }
    }

    if (closedIds.length > 0) {
      await supabase
        .from("holdings")
        .update({
          quantity: 0,
          short_quantity: 0,
          market_value: 0,
          last_updated_from: `upload:${statementId}`,
        })
        .in("id", closedIds);
      closed = closedIds.length;
    }
  }

  return { changes, upserted, closed };
}
