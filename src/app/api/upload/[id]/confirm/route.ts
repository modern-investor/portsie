import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeExtractedData } from "@/lib/upload/data-writer";
import { createManualAccount } from "@/lib/upload/account-matcher";
import type { DetectedAccountInfo } from "@/lib/upload/types";

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
  const { accountId, createNewAccount, accountInfo, entityId } = body as {
    accountId?: string;
    createNewAccount?: boolean;
    accountInfo?: DetectedAccountInfo;
    entityId?: string;
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

  if (statement.confirmed_at) {
    return NextResponse.json(
      { error: "This upload has already been confirmed" },
      { status: 409 }
    );
  }

  // Determine the target account
  let targetAccountId = accountId || statement.account_id;

  if (!targetAccountId && createNewAccount) {
    try {
      targetAccountId = await createManualAccount(
        supabase,
        user.id,
        {
          account_type:
            accountInfo?.account_type ??
            statement.detected_account_info?.account_type,
          institution_name:
            accountInfo?.institution_name ??
            statement.detected_account_info?.institution_name,
          account_nickname:
            accountInfo?.account_nickname ??
            statement.detected_account_info?.account_nickname,
        },
        entityId
      );
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

  try {
    const result = await writeExtractedData(
      supabase,
      user.id,
      targetAccountId,
      id,
      statement.extracted_data
    );

    return NextResponse.json({
      success: true,
      accountId: targetAccountId,
      transactionsCreated: result.transactionsCreated,
      positionsCreated: result.positionsCreated,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error during confirmation";
    console.error("Confirm failed:", err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
