import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  loadExistingAccountsForMatching,
  matchAccounts,
} from "@/lib/extraction/account-matcher";
import type { PortsieExtraction } from "@/lib/extraction/schema";

/**
 * GET /api/upload/[id]/preview
 *
 * Returns the stored PortsieExtraction along with proposed account mappings.
 * Account mappings are computed on-the-fly (deterministic, fast).
 * The user can review before confirming.
 *
 * Requires parse_status to be "extracted" or "completed".
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get the upload record
  const { data: statement, error } = await supabase
    .from("uploaded_statements")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !statement) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (!statement.extracted_data) {
    return NextResponse.json(
      {
        error: "No extraction data available. Extract the file first.",
        parseStatus: statement.parse_status,
      },
      { status: 400 }
    );
  }

  const extraction = statement.extracted_data as PortsieExtraction;

  // Compute account mappings on-the-fly
  const existingAccounts = await loadExistingAccountsForMatching(
    supabase,
    user.id
  );
  const accountMap = matchAccounts(extraction, existingAccounts);

  // Summary stats
  const totalPositions =
    extraction.accounts.reduce((sum, a) => sum + a.positions.length, 0) +
    extraction.unallocated_positions.length;
  const totalTransactions = extraction.accounts.reduce(
    (sum, a) => sum + a.transactions.length,
    0
  );
  const totalBalances = extraction.accounts.reduce(
    (sum, a) => sum + a.balances.length,
    0
  );

  return NextResponse.json({
    extraction,
    accountMap,
    existingAccounts: existingAccounts.map((a) => ({
      id: a.id,
      nickname: a.account_nickname,
      institution: a.institution_name,
      type: a.account_type,
      numberHint: a.account_number_hint,
      group: a.account_group,
    })),
    summary: {
      accounts: extraction.accounts.length,
      totalPositions,
      totalTransactions,
      totalBalances,
      unallocatedPositions: extraction.unallocated_positions.length,
      confidence: extraction.confidence,
      notes: extraction.notes,
    },
    parseStatus: statement.parse_status,
    isConfirmed: statement.parse_status === "completed",
  });
}
