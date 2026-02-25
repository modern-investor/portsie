import { NextResponse } from "next/server";

/**
 * POST /api/upload/[id]/process
 *
 * DEPRECATED — hard deprecated with 410 Gone.
 * Use POST /api/upload/[id]/extract?auto_confirm=true instead.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Deprecated endpoint. Use /extract?auto_confirm=true" },
    { status: 410 }
  );
}
