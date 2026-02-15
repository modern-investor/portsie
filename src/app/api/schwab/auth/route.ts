import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { SchwabAuth, getCallbackUrl } from "@/lib/schwab/client";
import { getSchwabCredentials } from "@/lib/schwab/credentials";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creds = await getSchwabCredentials(supabase, user.id);
  if (!creds) {
    return NextResponse.json(
      { error: "Schwab credentials not configured. Complete setup first." },
      { status: 400 }
    );
  }

  const callbackUrl = getCallbackUrl(request.nextUrl.origin);

  const state = randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("schwab_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  const auth = new SchwabAuth(creds.appKey, creds.appSecret, callbackUrl);
  const url = auth.getAuthorizationUrl(state);

  return NextResponse.json({ url });
}
