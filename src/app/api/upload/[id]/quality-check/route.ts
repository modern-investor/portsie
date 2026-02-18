import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  runQualityCheckForUpload,
  triggerPhase1Fix,
} from "@/lib/quality-check/orchestrator";

// Quality check + Phase 1 fix can take several minutes
export const maxDuration = 300; // 5 minutes

/**
 * POST /api/upload/[id]/quality-check
 *
 * Trigger a quality check for an upload that has been auto-confirmed.
 * If the check fails, automatically triggers Phase 1 fix (prompt retry).
 */
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

  // Verify upload exists and is in completed status
  const { data: upload } = await supabase
    .from("uploaded_statements")
    .select("id, parse_status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!upload) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (upload.parse_status !== "completed") {
    return NextResponse.json(
      { error: `Upload is not in completed status (current: ${upload.parse_status})` },
      { status: 409 }
    );
  }

  try {
    // Update status to qc_running
    await supabase
      .from("uploaded_statements")
      .update({
        parse_status: "qc_running",
        qc_status_message: "Verifying extracted data...",
      })
      .eq("id", id);

    // Run quality check
    const { checkId, checkResult } = await runQualityCheckForUpload(
      supabase,
      user.id,
      id
    );

    // If QC failed, auto-trigger Phase 1 fix
    if (!checkResult.overall_passed) {
      const fixed = await triggerPhase1Fix(supabase, user.id, checkId);
      return NextResponse.json({
        status: fixed ? "fixed" : "unresolved",
        checkId,
        checks: checkResult,
        fixed,
      });
    }

    return NextResponse.json({
      status: "passed",
      checkId,
      checks: checkResult,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Quality check failed";
    console.error("Quality check error:", err);

    // Reset to completed on error so the user isn't stuck in qc_running
    await supabase
      .from("uploaded_statements")
      .update({
        parse_status: "completed",
        qc_status_message: null,
      })
      .eq("id", id);

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

/**
 * GET /api/upload/[id]/quality-check
 *
 * Get the latest quality check for an upload.
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

  const { data: qc } = await supabase
    .from("quality_checks")
    .select("*")
    .eq("upload_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!qc) {
    return NextResponse.json(
      { error: "No quality check found" },
      { status: 404 }
    );
  }

  return NextResponse.json(qc);
}
