import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { SchwabAuth, getCallbackUrl } from "@/lib/schwab/client";
import { getSchwabCredentials } from "@/lib/schwab/credentials";
import { storeSchwabTokens } from "@/lib/schwab/tokens";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { code, state } = body;

  if (!code) {
    return NextResponse.json(
      { error: "Missing authorization code" },
      { status: 400 }
    );
  }

  // Validate CSRF state
  const cookieStore = await cookies();
  const savedState = cookieStore.get("schwab_oauth_state")?.value;
  if (!savedState || savedState !== state) {
    return NextResponse.json(
      { error: "Invalid state parameter" },
      { status: 400 }
    );
  }

  // Clear the state cookie
  cookieStore.delete("schwab_oauth_state");

  const creds = await getSchwabCredentials(supabase, user.id);
  if (!creds) {
    return NextResponse.json(
      { error: "Schwab credentials not found" },
      { status: 400 }
    );
  }

  const callbackUrl = getCallbackUrl(request.nextUrl.origin);

  try {
    const auth = new SchwabAuth(creds.appKey, creds.appSecret, callbackUrl);
    const tokenResponse = await auth.exchangeCode(code);
    await storeSchwabTokens(supabase, user.id, tokenResponse);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Schwab token exchange failed:", error);
    return NextResponse.json(
      { error: "Failed to connect Schwab account" },
      { status: 500 }
    );
  }
}
