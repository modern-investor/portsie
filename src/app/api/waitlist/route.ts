import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email";

/** POST /api/waitlist — Add email to waiting list and send welcome email */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body as { email?: string };

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();
    const supabase = createAdminClient();

    // Insert into waiting_list (unique constraint handles duplicates)
    const { error: insertError } = await supabase
      .from("waiting_list")
      .insert({ email: normalizedEmail });

    if (insertError) {
      // Duplicate email — still return success (don't leak info)
      if (insertError.code === "23505") {
        return NextResponse.json({ success: true, alreadyJoined: true });
      }
      console.error("[api/waitlist] Insert error:", insertError.message);
      return NextResponse.json(
        { error: "Failed to join waiting list" },
        { status: 500 }
      );
    }

    // Send welcome email (fire-and-forget — don't fail the request if email fails)
    sendTemplatedEmail({
      to: normalizedEmail,
      templateKey: "waitlist_welcome",
    }).catch((err) => {
      console.error("[api/waitlist] Failed to send welcome email:", err);
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
