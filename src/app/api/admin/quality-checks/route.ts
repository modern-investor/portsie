import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/quality-checks
 *
 * Returns all quality checks across all users (admin only).
 * Supports filtering by status and pagination.
 */
export async function GET(request: NextRequest) {
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

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  try {
    const adminClient = createAdminClient();

    // Build query
    let query = adminClient
      .from("quality_checks")
      .select(
        "id, user_id, upload_id, check_status, checks, fix_attempts, fix_count, resolved_at, created_at, upload:uploaded_statements(filename, file_type)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("check_status", status);
    }

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get user emails for display
    const userIds = [...new Set((data ?? []).map((d) => d.user_id))];
    const emailMap: Record<string, string> = {};

    if (userIds.length > 0) {
      const { data: authData } = await adminClient.auth.admin.listUsers();
      if (authData?.users) {
        for (const u of authData.users) {
          if (userIds.includes(u.id)) {
            emailMap[u.id] = u.email ?? "unknown";
          }
        }
      }
    }

    // Compute aggregate stats
    const allChecks = data ?? [];
    const stats = {
      total: count ?? allChecks.length,
      passed: 0,
      failed: 0,
      fixed: 0,
      unresolved: 0,
      fixing: 0,
    };

    for (const c of allChecks) {
      if (c.check_status === "passed") stats.passed++;
      else if (c.check_status === "failed") stats.failed++;
      else if (c.check_status === "fixed") stats.fixed++;
      else if (c.check_status === "unresolved") stats.unresolved++;
      else if (c.check_status === "fixing_prompt" || c.check_status === "fixing_code") stats.fixing++;
    }

    const enriched = allChecks.map((c) => ({
      ...c,
      user_email: emailMap[c.user_id] ?? "unknown",
    }));

    return NextResponse.json({
      checks: enriched,
      stats,
      total: count ?? allChecks.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Failed to fetch quality checks:", error);
    return NextResponse.json(
      { error: "Failed to fetch quality checks" },
      { status: 500 }
    );
  }
}
