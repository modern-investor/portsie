// ============================================================================
// Quiltt session token management
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { QUILTT_CONFIG, getQuilttApiSecret } from "./config";
import type { QuilttSessionResponse, QuilttProfileRecord } from "./types";

/**
 * Create a Quiltt session token for a user.
 * If the user already has a Quiltt profile, uses their profile ID.
 * Otherwise, creates a new Quiltt profile with their email.
 */
export async function createQuilttSession(
  email: string,
  existingProfileId?: string
): Promise<QuilttSessionResponse> {
  const secret = getQuilttApiSecret();

  const body: Record<string, string> = {};
  if (existingProfileId) {
    body.userId = existingProfileId;
  } else {
    body.email = email;
  }

  const response = await fetch(`${QUILTT_CONFIG.authBaseUrl}/users/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Quiltt session creation failed (${response.status}): ${errorText}`
    );
  }

  return response.json();
}

/**
 * Get the user's Quiltt profile from the database, or create one via the
 * Quiltt API and persist it.
 * Returns a fresh session token and the profile ID.
 */
export async function getOrCreateQuilttProfile(
  supabase: SupabaseClient,
  userId: string,
  email: string
): Promise<{ token: string; profileId: string; expiresAt: string }> {
  // Check for existing profile
  const { data: existing } = await supabase
    .from("quiltt_profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (existing) {
    const profile = existing as QuilttProfileRecord;
    // Create a new session for the existing profile
    const session = await createQuilttSession(email, profile.quiltt_profile_id);
    return {
      token: session.token,
      profileId: profile.quiltt_profile_id,
      expiresAt: session.expiresAt,
    };
  }

  // No profile yet — create one via Quiltt
  const session = await createQuilttSession(email);

  // Persist the profile mapping
  const { error } = await supabase.from("quiltt_profiles").insert({
    user_id: userId,
    quiltt_profile_id: session.userId,
  });

  if (error) {
    // If unique constraint violation, profile was created concurrently — fetch it
    if (error.code === "23505") {
      const { data: raceWinner } = await supabase
        .from("quiltt_profiles")
        .select("quiltt_profile_id")
        .eq("user_id", userId)
        .single();
      if (raceWinner) {
        return {
          token: session.token,
          profileId: raceWinner.quiltt_profile_id,
          expiresAt: session.expiresAt,
        };
      }
    }
    throw new Error(`Failed to store Quiltt profile: ${error.message}`);
  }

  return {
    token: session.token,
    profileId: session.userId,
    expiresAt: session.expiresAt,
  };
}

/**
 * Get the Quiltt profile ID for a user (or null if none exists).
 */
export async function getQuilttProfileId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("quiltt_profiles")
    .select("quiltt_profile_id")
    .eq("user_id", userId)
    .single();

  return data?.quiltt_profile_id ?? null;
}

/**
 * Check if a user has a Quiltt profile (i.e. has connected via Open Banking).
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
 * Delete a user's Quiltt profile mapping.
 */
export async function deleteQuilttProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from("quiltt_profiles")
    .delete()
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to delete Quiltt profile: ${error.message}`);
  }
}
