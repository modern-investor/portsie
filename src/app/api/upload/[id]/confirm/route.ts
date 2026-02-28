import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  loadExistingAccountsForMatching,
  matchAccounts,
} from "@/lib/extraction/account-matcher";
import { writeExtraction } from "@/lib/extraction/db-writer";
import { checkExtractionIntegrity } from "@/lib/extraction/integrity-check";
import type { PortsieExtraction, AccountMapResult } from "@/lib/extraction/schema";
import {
  completeIngestionRun,
  failIngestionRun,
  startIngestionRun,
} from "@/lib/extraction/ingestion-runs";
import { ProcessingLogger, sendDiagnostics } from "@/lib/extraction/processing-log";

export const maxDuration = 300; // 5 minutes — large extractions (50+ accounts) need time for sequential DB writes

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
  const runId = await startIngestionRun(supabase, {
    userId: user.id,
    sourceKey: "upload_document",
    runKind: "confirm",
    uploadedStatementId: id,
  });

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
    if (runId) {
      await failIngestionRun(supabase, {
        runId,
        errorCategory: "not_found",
        errorMessage: "Upload not found",
      });
    }
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (!statement.extracted_data) {
    if (runId) {
      await failIngestionRun(supabase, {
        runId,
        errorCategory: "missing_extraction",
        errorMessage: "No extraction data to confirm",
      });
    }
    return NextResponse.json(
      {
        error: "No extraction data to confirm. Extract the file first.",
        parseStatus: statement.parse_status,
      },
      { status: 400 }
    );
  }

  const extraction = statement.extracted_data as PortsieExtraction;

  // Initialize processing log for confirm stage
  const log = new ProcessingLogger(id, statement.process_count ?? 1, {
    filename: statement.filename,
    fileType: statement.file_type,
    sizeBytes: statement.file_size_bytes ?? 0,
  });

  try {
    // ── Stage 2.5: Account matching ──
    log.startStep("matching", "Matching accounts");
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
    log.completeStep("matching");

    // ── Integrity check (pre-write validation) ──
    log.startStep("validating", "Checking data integrity");
    const integrityReport = checkExtractionIntegrity(extraction);
    log.completeStep("validating");

    // ── Stage 3: DB writes ──
    log.startStep("writing", "Saving to portfolio");
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
    log.completeStep("writing");

    log.finalize("success");

    if (runId) {
      await completeIngestionRun(supabase, {
        runId,
        diagnostics: {
          matchedAccounts: accountMap.mappings.filter((m) => m.action === "match_existing").length,
          newAccounts: accountMap.mappings.filter((m) => m.action === "create_new").length,
          warnings: writeReport.warnings.length,
        },
      });
    }

    sendDiagnostics(log, { userId: user.id, stage: "confirm" });

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

    log.failStep(log.currentStep(), errorMessage);
    log.finalize("failed", "confirm_failed", errorMessage);

    await supabase
      .from("uploaded_statements")
      .update({
        parse_error: `Confirm failed: ${errorMessage}`,
      })
      .eq("id", id);

    if (runId) {
      await failIngestionRun(supabase, {
        runId,
        errorCategory: "confirm_failed",
        errorMessage,
      });
    }

    sendDiagnostics(log, { userId: user.id, stage: "confirm" });

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
