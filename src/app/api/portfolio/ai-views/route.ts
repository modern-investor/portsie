import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AIViewSuggestionRow } from "@/lib/portfolio/ai-views-types";
import { rowToSuggestion } from "@/lib/portfolio/ai-views-types";

/**
 * GET /api/portfolio/ai-views
 * Fetch the user's stored AI view suggestions.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("ai_view_suggestions")
    .select("*")
    .eq("user_id", user.id)
    .order("is_builtin", { ascending: false })
    .order("suggestion_provider")
    .order("suggestion_order") as { data: AIViewSuggestionRow[] | null; error: unknown };

  if (error) {
    console.error("[ai-views GET] DB error:", error);
    return NextResponse.json({ error: "Failed to fetch suggestions" }, { status: 500 });
  }

  const suggestions = (rows ?? []).map(rowToSuggestion);
  return NextResponse.json({ suggestions });
}

/**
 * DELETE /api/portfolio/ai-views
 * Clear all AI view suggestions for the user (allows regeneration).
 */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("ai_view_suggestions")
    .delete()
    .eq("user_id", user.id);

  if (error) {
    console.error("[ai-views DELETE] DB error:", error);
    return NextResponse.json({ error: "Failed to delete suggestions" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
