import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { STYLE_GUIDE_DEFAULTS } from "@/lib/style-guide/defaults";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("style_guide")
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(STYLE_GUIDE_DEFAULTS);
  }

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
