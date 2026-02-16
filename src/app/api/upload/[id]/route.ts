import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET /api/upload/[id] — Fetch a single upload record */
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

  const { data, error } = await supabase
    .from("uploaded_statements")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

/** DELETE /api/upload/[id] — Delete an upload and its storage file */
export async function DELETE(
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

  // Get the record to find the storage path
  const { data: statement } = await supabase
    .from("uploaded_statements")
    .select("file_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!statement) {
    return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  }

  // Delete from storage and database
  await supabase.storage.from("statements").remove([statement.file_path]);
  const { error } = await supabase
    .from("uploaded_statements")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Failed to delete upload:", error);
    return NextResponse.json(
      { error: "Failed to delete upload" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
