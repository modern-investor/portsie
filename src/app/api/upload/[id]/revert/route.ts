import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revertConfirmedUpload } from "@/lib/upload/data-reverter";

/** POST /api/upload/[id]/revert — revert a confirmed upload, deleting its data */
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

  // Verify the upload exists, belongs to user, and is confirmed
  const { data: statement } = await supabase
    .from("uploaded_statements")
    .select("id, user_id, confirmed_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!statement) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  if (!statement.confirmed_at) {
    return NextResponse.json(
      { error: "This upload has not been confirmed yet" },
      { status: 400 }
    );
  }

  try {
    const result = await revertConfirmedUpload(supabase, user.id, id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Revert failed";
    console.error("Revert failed:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
