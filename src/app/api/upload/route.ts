import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { MIME_TO_FILE_TYPE } from "@/lib/upload/types";
import { UPLOAD_CONFIG } from "@/lib/upload/config";

/** POST /api/upload — Upload a file and create a metadata record */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // Validate MIME type
  const fileType = MIME_TO_FILE_TYPE[file.type];
  if (!fileType) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}` },
      { status: 400 }
    );
  }

  // Validate size
  if (file.size > UPLOAD_CONFIG.maxFileSizeBytes) {
    return NextResponse.json(
      { error: "File too large (max 50MB)" },
      { status: 400 }
    );
  }

  // Read file buffer and compute hash for deduplication
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileHash = createHash("sha256").update(buffer).digest("hex");

  // Check for duplicate upload (same file content for same user)
  const { data: existing } = await supabase
    .from("uploaded_statements")
    .select("*")
    .eq("user_id", user.id)
    .eq("file_hash", fileHash)
    .limit(1)
    .single();

  // Upload to Supabase Storage under user's folder
  const filePath = `${user.id}/${Date.now()}_${file.name}`;
  const { error: storageError } = await supabase.storage
    .from("statements")
    .upload(filePath, buffer, { contentType: file.type });

  if (storageError) {
    console.error("Storage upload failed:", storageError);
    return NextResponse.json(
      { error: `Storage upload failed: ${storageError.message}` },
      { status: 500 }
    );
  }

  // If a duplicate exists and was already processed, carry over its results
  const isProcessed =
    existing &&
    (existing.parse_status === "completed" || existing.parse_status === "partial");

  const insertData: Record<string, unknown> = {
    user_id: user.id,
    filename: file.name,
    file_path: filePath,
    file_type: fileType,
    file_size_bytes: file.size,
    file_hash: fileHash,
    parse_status: isProcessed ? existing.parse_status : "pending",
    ...(isProcessed && {
      parsed_at: existing.parsed_at,
      extracted_data: existing.extracted_data,
      raw_llm_response: existing.raw_llm_response,
      detected_account_info: existing.detected_account_info,
      statement_start_date: existing.statement_start_date,
      statement_end_date: existing.statement_end_date,
    }),
  };

  // Create metadata record in uploaded_statements
  const { data: statement, error: dbError } = await supabase
    .from("uploaded_statements")
    .insert(insertData)
    .select()
    .single();

  if (dbError) {
    // Clean up storage file on DB failure
    await supabase.storage.from("statements").remove([filePath]);
    console.error("Failed to create upload record:", dbError);
    return NextResponse.json(
      { error: `Failed to create record: ${dbError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(statement, { status: 201 });
}

/** GET /api/upload — List all uploads for the current user */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("uploaded_statements")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch uploads:", error);
    return NextResponse.json(
      { error: "Failed to fetch uploads" },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
