import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processFileForLLM } from "@/lib/upload/file-processor";
import { extractFinancialData } from "@/lib/llm/dispatcher";
import { resolveAccountLinks } from "@/lib/upload/account-matcher";
import { writeExtractedData, writeMultiAccountData } from "@/lib/upload/data-writer";
import { getLLMSettings } from "@/lib/llm/settings";
import type { UploadFileType, ExistingAccountContext } from "@/lib/upload/types";
import type { AutoLinkResult } from "@/lib/upload/account-matcher";

// LLM extraction can take several minutes for large PDF/CSV files
export const maxDuration = 300; // 5 minutes

/** POST /api/upload/[id]/process — Trigger LLM extraction for an upload */
export async function POST(
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

  if (statement.parse_status === "processing") {
    return NextResponse.json(
      { error: "This file is already being processed" },
      { status: 409 }
    );
  }

  // Track processing attempt count
  const newProcessCount = (statement.process_count ?? 0) + 1;

  // Mark as processing, increment attempt counter, and clear previous confirmation state
  await supabase
    .from("uploaded_statements")
    .update({
      parse_status: "processing",
      parse_error: null,
      process_count: newProcessCount,
      confirmed_at: null,
    })
    .eq("id", id);

  try {
    // Fetch the user's existing active accounts for prompt injection
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

    // Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("statements")
      .download(statement.file_path);

    if (downloadError || !fileData) {
      throw new Error(
        `Failed to download file: ${downloadError?.message ?? "No data"}`
      );
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const fileType = statement.file_type as UploadFileType;

    // Pre-process the file for Claude
    const processedFile = processFileForLLM(buffer, fileType, fileData.type);

    // Extract data via configured LLM backend (CLI or API) with account context
    const { result: extractionResult, rawResponse } =
      await extractFinancialData(
        supabase,
        user.id,
        processedFile,
        fileType,
        statement.filename,
        existingAccounts
      );

    // Determine if extraction produced data
    const hasData =
      extractionResult.transactions.length > 0 ||
      extractionResult.positions.length > 0 ||
      extractionResult.balances.length > 0;

    const parseStatus = hasData ? "completed" : "partial";

    // Auto-link/create account(s) and auto-confirm
    let autoLinkResult: AutoLinkResult | null = null;
    let autoConfirmed = false;
    let autoConfirmError: string | null = null;
    let transactionsCreated = 0;
    let positionsCreated = 0;
    let accountsCreated = 0;
    let linkedAccountIds: string[] = [];

    if (hasData) {
      try {
        // Ensure we have an accounts array to work with
        const accounts = extractionResult.accounts ?? [];

        if (accounts.length > 0) {
          // Resolve account links — handles Claude's account_link decisions,
          // heuristic validation, and backward-compat fallback in one function
          const accountMap = await resolveAccountLinks(
            supabase,
            user.id,
            accounts,
            existingAccounts
          );

          const writeResult = await writeMultiAccountData(
            supabase,
            user.id,
            id,
            extractionResult,
            accountMap
          );

          transactionsCreated = writeResult.totalTransactionsCreated;
          positionsCreated = writeResult.totalSnapshotsWritten;
          accountsCreated = accounts.length;
          linkedAccountIds = writeResult.linkedAccountIds;
          autoConfirmed = true;

          // Set autoLinkResult to the first account for backward compat
          const firstLink = accountMap.get(0);
          if (firstLink) {
            autoLinkResult = {
              accountId: firstLink.accountId,
              action: firstLink.action,
              matchReason:
                accounts.length > 1
                  ? `Multi-account: ${accountsCreated} accounts processed`
                  : firstLink.matchReason,
              accountNickname: firstLink.accountNickname,
            };
          }
        } else {
          // No accounts array (shouldn't happen with current prompt, but handle gracefully)
          // Fall back to creating a single account from top-level account_info
          const { createManualAccount } = await import(
            "@/lib/upload/account-matcher"
          );
          const accountInfo = extractionResult.account_info ?? {
            institution_name: "Unknown",
            account_type: null,
            account_number: null,
            account_nickname: statement.filename,
          };
          const newId = await createManualAccount(
            supabase,
            user.id,
            accountInfo
          );

          const writeResult = await writeExtractedData(
            supabase,
            user.id,
            newId,
            id,
            extractionResult
          );

          transactionsCreated = writeResult.transactionsCreated;
          positionsCreated = writeResult.snapshotsWritten;
          linkedAccountIds = [newId];
          accountsCreated = 1;
          autoConfirmed = true;
          autoLinkResult = {
            accountId: newId,
            action: "created",
            accountNickname:
              accountInfo.account_nickname ||
              `${accountInfo.institution_name || "Unknown"} Account`,
          };
        }
      } catch (linkErr) {
        // Auto-link/confirm failed — save extraction results anyway
        autoConfirmError =
          linkErr instanceof Error
            ? linkErr.message
            : "Unknown auto-confirm error";
        console.error("Auto-link/confirm failed:", linkErr);
      }
    }

    // Save extraction results to the database
    await supabase
      .from("uploaded_statements")
      .update({
        parse_status: parseStatus,
        parsed_at: new Date().toISOString(),
        extracted_data: extractionResult,
        raw_llm_response: rawResponse,
        detected_account_info: extractionResult.account_info,
        account_id: autoLinkResult?.accountId ?? null,
        linked_account_ids: linkedAccountIds,
        statement_start_date: extractionResult.statement_start_date,
        statement_end_date: extractionResult.statement_end_date,
        parse_error: autoConfirmError,
      })
      .eq("id", id);

    return NextResponse.json({
      extraction: extractionResult,
      autoLinkedAccountId: autoLinkResult?.accountId ?? null,
      autoLinkAction: autoLinkResult?.action ?? null,
      autoLinkReason: autoLinkResult?.matchReason ?? null,
      autoConfirmed,
      autoConfirmError,
      transactionsCreated,
      positionsCreated,
      accountsCreated,
      linkedAccountIds,
      parseStatus,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown processing error";
    console.error("LLM processing failed:", err);

    await supabase
      .from("uploaded_statements")
      .update({
        parse_status: "failed",
        parse_error: errorMessage,
      })
      .eq("id", id);

    // Auto-log extraction failure on 2nd+ attempt for diagnostic review
    if (newProcessCount >= 2) {
      try {
        const settings = await getLLMSettings(supabase, user.id);
        await supabase.from("extraction_failures").insert({
          user_id: user.id,
          upload_id: id,
          filename: statement.filename,
          file_type: statement.file_type,
          file_path: statement.file_path,
          attempt_number: newProcessCount,
          error_message: errorMessage,
          llm_mode: settings?.llmMode ?? "cli",
          file_size_bytes: statement.file_size_bytes,
        });
      } catch (logErr) {
        console.error("Failed to log extraction failure:", logErr);
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
