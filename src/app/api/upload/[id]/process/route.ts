import { NextResponse } from "next/server";

/**
 * POST /api/upload/[id]/process
 *
 * DEPRECATED — hard deprecated with 410 Gone.
 * Use POST /api/upload/[id]/extract, then /confirm, then /verify.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Deprecated endpoint. Use /extract, then /confirm, then /verify" },
    { status: 410 }
  );
}
