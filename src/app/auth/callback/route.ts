import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Handle OAuth provider errors (Google sends error params on failure)
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (errorParam) {
    console.error(
      "[auth/callback] OAuth provider error:",
      errorParam,
      errorDescription
    );
    const message =
      errorDescription || errorParam || "Authentication was denied";
    return NextResponse.redirect(
      `${origin}/auth/error?error=${encodeURIComponent(message)}`
    );
  }

  if (!code) {
    console.error("[auth/callback] No code parameter in callback URL");
    return NextResponse.redirect(
      `${origin}/auth/error?error=${encodeURIComponent(
        "No authorization code received. Please try signing in again."
      )}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error(
      "[auth/callback] exchangeCodeForSession failed:",
      error.message
    );
    return NextResponse.redirect(
      `${origin}/auth/error?error=${encodeURIComponent(error.message)}`
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
