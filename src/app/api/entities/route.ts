import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET /api/entities — list user's entities (auto-creates default if none) */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("entities")
    .select("*")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("entity_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-create default "Personal" entity if none exist
  if (!data || data.length === 0) {
    const { data: newEntity, error: createErr } = await supabase
      .from("entities")
      .insert({
        user_id: user.id,
        entity_name: "Personal",
        entity_type: "personal",
        is_default: true,
      })
      .select()
      .single();

    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }
    return NextResponse.json([newEntity]);
  }

  return NextResponse.json(data);
}

/** POST /api/entities — create a new entity */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { entity_name, entity_type } = await request.json();

  if (!entity_name) {
    return NextResponse.json(
      { error: "entity_name is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("entities")
    .insert({
      user_id: user.id,
      entity_name,
      entity_type: entity_type || "other",
      is_default: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
