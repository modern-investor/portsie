import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/settings/diagnostics
 *
 * Returns failure analyses for the current user, ordered by recency.
 * Each row contains Claude Code's root-cause analysis of a failed extraction,
 * including timing breakdown, severity, and recommended fix.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("failure_analyses")
    .select(
      "id, upload_id, extraction_failure_id, root_cause, affected_step, timing_breakdown, recommended_fix, severity, analysis_model, analysis_duration_ms, filename, file_size_bytes, processing_settings, processing_log, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
