import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assemblePortfolio } from "@/lib/portfolio/fetch-portfolio";

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
  /** Account category: "brokerage", "banking", "credit", "loan", "offline". */
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

  const body = await assemblePortfolio(supabase, user.id);
  return NextResponse.json(body);
}
