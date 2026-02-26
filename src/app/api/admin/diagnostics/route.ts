import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/diagnostics
 *
 * Returns recent processing logs across all users (admin only).
 * Used by the admin diagnostics tab in the settings panel.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await isAdmin(supabase, user.id);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from("uploaded_statements")
    .select(
      "id, filename, file_type, file_size_bytes, parse_status, parse_error, processing_log, processing_step, processing_settings, created_at, updated_at"
    )
    .not("processing_log", "is", null)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch diagnostics" },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
