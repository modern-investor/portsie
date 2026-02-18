import type { SupabaseClient } from "@supabase/supabase-js";

const QUILTT_AUTH_URL = "https://auth.quiltt.io/v1/users/sessions";

interface QuilttSessionResponse {
  token: string;
  userId: string;
  expiration: number;
  expiresAt: string;
}

/**
 * Get or create a Quiltt session token for a Portsie user.
 *
 * 1. Check quiltt_profiles for an existing Quiltt profile
 * 2. If found, issue a new session for that profile
 * 3. If not found, create a new Quiltt profile and save the mapping
 */
export async function getOrCreateQuilttSession(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string
): Promise<{ token: string; profileId: string }> {
  const secretKey = process.env.QUILTT_SECRET_KEY;
  if (!secretKey) {
    throw new Error("QUILTT_SECRET_KEY is not configured");
  }

  // Check for existing profile
  const { data: profile } = await supabase
    .from("quiltt_profiles")
    .select("quiltt_profile_id")
    .eq("user_id", userId)
    .single();

  if (profile?.quiltt_profile_id) {
    // Issue session for existing profile
    const session = await issueQuilttSession(secretKey, {
      userId: profile.quiltt_profile_id,
    });
    return { token: session.token, profileId: profile.quiltt_profile_id };
  }

  // Create new profile via Quiltt
  const session = await issueQuilttSession(secretKey, {
    email: userEmail,
    metadata: { portsie_user_id: userId },
  });

  // Save the profile mapping
  const { error } = await supabase.from("quiltt_profiles").insert({
    user_id: userId,
    quiltt_profile_id: session.userId,
  });

  if (error) {
    // If unique constraint violation, profile was created concurrently — fetch it
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("quiltt_profiles")
        .select("quiltt_profile_id")
        .eq("user_id", userId)
        .single();
      if (existing) {
        return { token: session.token, profileId: existing.quiltt_profile_id };
      }
    }
    throw new Error(`Failed to save Quiltt profile: ${error.message}`);
  }

  return { token: session.token, profileId: session.userId };
}

/**
 * Check if a user has a Quiltt profile linked.
 */
export async function hasQuilttProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("quiltt_profiles")
    .select("id")
    .eq("user_id", userId)
    .single();
  return !!data;
}

/**
 * Issue a Quiltt session token via the Auth API.
 */
async function issueQuilttSession(
  secretKey: string,
  body: Record<string, unknown>
): Promise<QuilttSessionResponse> {
  const res = await fetch(QUILTT_AUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Quiltt Auth API error (${res.status}): ${text}`);
  }

  return res.json();
}
