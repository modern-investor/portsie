import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdmin } from "@/lib/supabase/admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: targetUserId } = await params;

  // Verify caller is authenticated and is an admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await isAdmin(supabase, user.id);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Prevent removing own admin role
  if (targetUserId === user.id) {
    return NextResponse.json(
      { error: "Cannot change your own role" },
      { status: 400 }
    );
  }

  const { role } = await request.json();
  if (!role || !["admin", "user"].includes(role)) {
    return NextResponse.json(
      { error: "Role must be 'admin' or 'user'" },
      { status: 400 }
    );
  }

  try {
    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("user_profiles")
      .update({ role, updated_at: new Date().toISOString() })
      .eq("user_id", targetUserId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update user role:", error);
    return NextResponse.json(
      { error: "Failed to update role" },
      { status: 500 }
    );
  }
}
