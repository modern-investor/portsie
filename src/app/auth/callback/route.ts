import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email";

/**
 * Add an email to the waiting list and send a welcome email.
 * Silently handles duplicates and email send failures.
 */
async function addToWaitingList(email: string) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("waiting_list")
      .insert({ email: email.trim().toLowerCase() });

    // 23505 = unique constraint violation (already on list) — that's fine
    if (error && error.code !== "23505") {
      console.error("[auth/callback] Failed to add to waiting list:", error.message);
      return;
    }

    // Only send email for new signups (not duplicates)
    if (!error) {
      sendTemplatedEmail({
        to: email.trim().toLowerCase(),
        templateKey: "waitlist_welcome",
      }).catch((err) => {
        console.error("[auth/callback] Failed to send waitlist email:", err);
      });
    }
  } catch (err) {
    console.error("[auth/callback] addToWaitingList exception:", err);
  }
}

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
  const result = await supabase.auth.exchangeCodeForSession(code);

  if (result.error) {
    console.error(
      "[auth/callback] exchangeCodeForSession failed:",
      result.error.message
    );

    // If we got a user email from the failed attempt, add to waiting list
    const email = (
      result.data as unknown as { user?: { email?: string } | null } | null
    )?.user?.email;
    if (email) {
      await addToWaitingList(email);
      return NextResponse.redirect(
        `${origin}/auth/error?error=${encodeURIComponent(
          result.error.message
        )}&email=${encodeURIComponent(email)}&waitlisted=true`
      );
    }

    return NextResponse.redirect(
      `${origin}/auth/error?error=${encodeURIComponent(result.error.message)}`
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
