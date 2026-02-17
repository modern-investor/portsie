import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeExtractedData, writeMultiAccountData } from "@/lib/upload/data-writer";
import { createManualAccount, resolveAccountLinks } from "@/lib/upload/account-matcher";
import type { DetectedAccountInfo, LLMExtractionResult, ExistingAccountContext } from "@/lib/upload/types";

/** POST /api/upload/[id]/confirm — Confirm extracted data and write to canonical tables */
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

  const body = await request.json();
  const { accountId, createNewAccount, accountInfo } = body as {
    accountId?: string;
    createNewAccount?: boolean;
    accountInfo?: DetectedAccountInfo;
  };

  // Get the upload record
  const { data: statement } = await supabase
    .from("uploaded_statements")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!statement) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (!statement.extracted_data) {
    return NextResponse.json(
      { error: "No extraction data to confirm. Process the file first." },
      { status: 400 }
    );
  }

  const extractedData = statement.extracted_data as LLMExtractionResult;

  // Allow re-confirmation (e.g. after re-processing)

  // Detect multi-account extraction
  const isMultiAccount =
    Array.isArray(extractedData.accounts) &&
    extractedData.accounts.length > 1;

  try {
    if (isMultiAccount) {
      // ── Multi-account re-confirmation ──
      // Fetch existing accounts for resolveAccountLinks
      const { data: rawAccounts } = await supabase
        .from("accounts")
        .select(
          "id, account_nickname, institution_name, account_type, schwab_account_number, account_group"
        )
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(100);

      const existingAccounts: ExistingAccountContext[] = (rawAccounts ?? []).map(
        (a) => ({
          id: a.id,
          account_nickname: a.account_nickname,
          institution_name: a.institution_name,
          account_type: a.account_type,
          account_number_hint: a.schwab_account_number
            ? `...${a.schwab_account_number.slice(-4)}`
            : null,
          account_group: a.account_group,
        })
      );

      const accountMap = await resolveAccountLinks(
        supabase,
        user.id,
        extractedData.accounts!,
        existingAccounts
      );

      const writeResult = await writeMultiAccountData(
        supabase,
        user.id,
        id,
        extractedData,
        accountMap
      );

      return NextResponse.json({
        success: true,
        accountsCreated: extractedData.accounts!.length,
        linkedAccountIds: writeResult.linkedAccountIds,
        transactionsCreated: writeResult.totalTransactionsCreated,
        positionsCreated: writeResult.totalSnapshotsWritten,
        holdingsCreated: writeResult.totalHoldingsCreated,
        holdingsClosed: writeResult.totalHoldingsClosed,
      });
    }

    // ── Single-account path (existing logic) ──
    let targetAccountId = accountId || statement.account_id;

    if (!targetAccountId && createNewAccount) {
      try {
        targetAccountId = await createManualAccount(supabase, user.id, {
          account_type:
            accountInfo?.account_type ??
            statement.detected_account_info?.account_type,
          institution_name:
            accountInfo?.institution_name ??
            statement.detected_account_info?.institution_name,
          account_nickname:
            accountInfo?.account_nickname ??
            statement.detected_account_info?.account_nickname,
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to create account";
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }

    if (!targetAccountId) {
      return NextResponse.json(
        {
          error:
            "No account selected. Choose an existing account or create a new one.",
        },
        { status: 400 }
      );
    }

    const result = await writeExtractedData(
      supabase,
      user.id,
      targetAccountId,
      id,
      extractedData
    );

    return NextResponse.json({
      success: true,
      accountId: targetAccountId,
      transactionsCreated: result.transactionsCreated,
      positionsCreated: result.snapshotsWritten,
      holdingsCreated: result.holdingsCreated,
      holdingsUpdated: result.holdingsUpdated,
      holdingsClosed: result.holdingsClosed,
      changes: result.changes,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error during confirmation";
    console.error("Confirm failed:", err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
