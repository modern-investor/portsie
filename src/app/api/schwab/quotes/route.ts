import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken, SchwabApiClient } from "@/lib/schwab/client";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const symbolsParam = request.nextUrl.searchParams.get("symbols");
  if (!symbolsParam) {
    return NextResponse.json(
      { error: "Missing symbols parameter" },
      { status: 400 }
    );
  }

  const symbols = symbolsParam.split(",").map((s) => s.trim().toUpperCase());

  try {
    const accessToken = await getValidAccessToken(supabase, user.id);
    const client = new SchwabApiClient(accessToken);
    const quotes = await client.getQuotes(symbols);
    return NextResponse.json(quotes);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "SCHWAB_NOT_CONNECTED") {
        return NextResponse.json(
          { error: "Schwab account not connected" },
          { status: 404 }
        );
      }
      if (error.message === "SCHWAB_REFRESH_EXPIRED") {
        return NextResponse.json(
          { error: "Schwab connection expired, please reconnect" },
          { status: 401 }
        );
      }
    }
    console.error("Failed to fetch quotes:", error);
    return NextResponse.json(
      { error: "Failed to fetch quotes" },
      { status: 500 }
    );
  }
}
