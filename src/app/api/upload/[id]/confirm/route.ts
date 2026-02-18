import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  loadExistingAccountsForMatching,
  matchAccounts,
} from "@/lib/extraction/account-matcher";
import { writeExtraction } from "@/lib/extraction/db-writer";
import { checkExtractionIntegrity } from "@/lib/extraction/integrity-check";
import type { PortsieExtraction, AccountMapResult } from "@/lib/extraction/schema";

/**
 * POST /api/upload/[id]/confirm
 *
 * Stage 2.5+3: Account matching + DB writes.
 * Reads the stored PortsieExtraction, matches accounts, writes to DB.
 *
 * Request body (optional):
 *   { accountMapOverrides?: Partial<AccountMapResult> }
 *
 * If accountMapOverrides is provided, it merges with the computed mappings.
 * This lets the user override specific account matching decisions from the
 * preview UI before confirming.
 */
export async function POST(
  request: NextRequest,
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

  // Parse optional overrides from request body
  let accountMapOverrides: Partial<AccountMapResult> | undefined;
  try {
    const body = await request.json();
    accountMapOverrides = body?.accountMapOverrides;
  } catch {
    // Empty body is fine
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
        error: "No extraction data to confirm. Extract the file first.",
        parseStatus: statement.parse_status,
      },
      { status: 400 }
    );
  }

  const extraction = statement.extracted_data as PortsieExtraction;

  try {
    // ── Stage 2.5: Account matching ──
    const existingAccounts = await loadExistingAccountsForMatching(
      supabase,
      user.id
    );
    let accountMap = matchAccounts(extraction, existingAccounts);

    // Apply user overrides if provided
    if (accountMapOverrides?.mappings) {
      const overrideMap = new Map(
        accountMapOverrides.mappings.map((m) => [m.extraction_index, m])
      );
      accountMap = {
        ...accountMap,
        mappings: accountMap.mappings.map((m) => {
          const override = overrideMap.get(m.extraction_index);
          return override ?? m;
        }),
      };
    }
    if (accountMapOverrides?.aggregate_account_id !== undefined) {
      accountMap.aggregate_account_id =
        accountMapOverrides.aggregate_account_id;
    }

    // ── Integrity check (pre-write validation) ──
    const integrityReport = checkExtractionIntegrity(extraction);

    // ── Stage 3: DB writes ──
    const writeReport = await writeExtraction(
      supabase,
      user.id,
      id,
      extraction,
      accountMap
    );

    // Store integrity report on the statement
    await supabase
      .from("uploaded_statements")
      .update({ integrity_report: integrityReport })
      .eq("id", id);

    return NextResponse.json({
      success: true,
      writeReport,
      integrityReport,
      parseStatus: "completed",
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error during confirmation";
    console.error("Confirm failed:", err);

    await supabase
      .from("uploaded_statements")
      .update({
        parse_error: `Confirm failed: ${errorMessage}`,
      })
      .eq("id", id);

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
