import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/settings/quality-checks
 *
 * Returns the current user's quality check history, newest first.
 * Joins with uploaded_statements for filename/file_type.
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
    .from("quality_checks")
    .select(
      "id, upload_id, check_status, checks, fix_attempts, fix_count, resolved_at, created_at, upload:uploaded_statements(filename, file_type)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
