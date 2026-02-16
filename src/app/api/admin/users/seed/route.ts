import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdmin } from "@/lib/supabase/admin";

interface SeedUser {
  email: string;
  name: string;
}

export async function POST(request: NextRequest) {
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

  try {
    const { users: seedUsers } = (await request.json()) as {
      users: SeedUser[];
    };

    if (!Array.isArray(seedUsers) || seedUsers.length === 0) {
      return NextResponse.json(
        { error: "Request body must include a non-empty users array" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const created: string[] = [];
    const skipped: string[] = [];
    const errors: { email: string; error: string }[] = [];

    // Get existing users so we can match by email
    const { data: existingUsers } =
      await adminClient.auth.admin.listUsers();
    const emailToId = new Map(
      (existingUsers?.users ?? []).map((u) => [u.email, u.id])
    );

    for (const { email, name } of seedUsers) {
      const existingId = emailToId.get(email);

      if (existingId) {
        // User already exists — update their password so login works
        const { error: updateError } =
          await adminClient.auth.admin.updateUserById(existingId, {
            password: "test1234",
            email_confirm: true,
            user_metadata: { full_name: name },
          });

        if (updateError) {
          errors.push({ email, error: updateError.message });
        } else {
          skipped.push(email);
        }
      } else {
        // Create new user
        const { error: createError } =
          await adminClient.auth.admin.createUser({
            email,
            password: "test1234",
            email_confirm: true,
            user_metadata: { full_name: name },
          });

        if (createError) {
          errors.push({ email, error: createError.message });
        } else {
          created.push(email);
        }
      }
    }

    return NextResponse.json({ created, skipped, errors });
  } catch (error) {
    console.error("Failed to seed users:", error);
    return NextResponse.json(
      { error: "Failed to seed users" },
      { status: 500 }
    );
  }
}
