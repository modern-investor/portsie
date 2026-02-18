import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { triggerPhase1Fix } from "@/lib/quality-check/orchestrator";

// Phase 1 fix can take several minutes
export const maxDuration = 300; // 5 minutes

/**
 * POST /api/upload/[id]/quality-check/fix
 *
 * Manually trigger a fix for a failed quality check.
 * Body: { phase: 1 } (Phase 2 deferred to future implementation)
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

  const body = await request.json().catch(() => ({}));
  const phase = body.phase ?? 1;

  if (phase !== 1) {
    return NextResponse.json(
      { error: "Only Phase 1 (prompt fix) is currently supported" },
      { status: 400 }
    );
  }

  // Find the latest quality check for this upload
  const { data: qc } = await supabase
    .from("quality_checks")
    .select("id, check_status")
    .eq("upload_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!qc) {
    return NextResponse.json(
      { error: "No quality check found for this upload" },
      { status: 404 }
    );
  }

  if (!["failed", "unresolved"].includes(qc.check_status)) {
    return NextResponse.json(
      { error: `Quality check is not in a fixable state (current: ${qc.check_status})` },
      { status: 409 }
    );
  }

  try {
    const fixed = await triggerPhase1Fix(supabase, user.id, qc.id);
    return NextResponse.json({ fixed, qualityCheckId: qc.id });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Fix attempt failed";
    console.error("Quality check fix error:", err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
