import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET /api/settings/failures — List extraction failures (or single by ?id=) */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const failureId = request.nextUrl.searchParams.get("id");

  // Single failure detail (includes raw_llm_response)
  if (failureId) {
    const { data, error } = await supabase
      .from("extraction_failures")
      .select("*")
      .eq("id", failureId)
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  }

  // List all failures (lightweight — no raw_llm_response)
  const { data, error } = await supabase
    .from("extraction_failures")
    .select(
      "id, filename, file_type, attempt_number, error_message, created_at, resolved_at, resolution_notes, upload_id"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

/** PATCH /api/settings/failures — Mark a failure as resolved */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, resolution_notes } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("extraction_failures")
    .update({
      resolved_at: new Date().toISOString(),
      resolution_notes: resolution_notes ?? null,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
