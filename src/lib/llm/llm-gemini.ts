import { buildExtractionPrompt } from "./prompts";
import type { ProcessedFile } from "../upload/file-processor";
import type { UploadFileType } from "../upload/types";
import { validateExtraction } from "../extraction/validate";
import { withRetry } from "./retry";
import type { ExtractionResult } from "./types";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const DEFAULT_MODEL = "gemini-3-flash-preview";

/**
 * Gemini Flash backend: uses the Google Generative Language REST API.
 * Default extraction engine — same prompt as Claude backends, validated
 * through the same PortsieExtraction schema.
 *
 * For very large binary files (>4 MB base64), uses the File API to upload
 * the file first, then references it by URI. Files under 4 MB are sent
 * inline in the request body, which is much faster (avoids the two-step
 * resumable upload + ACTIVE polling overhead).
 */
export async function extractViaGemini(
  apiKey: string,
  processedFile: ProcessedFile,
  fileType: UploadFileType,
  filename: string,
  model?: string,
  thinkingLevelOverride?: "minimal" | "low" | "medium" | "high",
  mediaResolutionOverride?: string,
  deadlineMs?: number
): Promise<ExtractionResult> {
  const geminiModel = model || DEFAULT_MODEL;
  const systemPrompt = buildExtractionPrompt();

  // Build content parts for the user message
  const parts: GeminiPart[] = [];

  parts.push({
    text: `Extract financial data from this ${fileType.toUpperCase()} file named "${filename}". You MUST extract EVERY account — do NOT summarize, abbreviate, or select a representative subset. Include ALL accounts even if there are dozens. Respond ONLY with the JSON object.`,
  });

  // For very large binary files (>4 MB base64 ≈ 3 MB raw), upload via
  // File API. Smaller files use inline data — much faster since it skips
  // the two-step resumable upload + ACTIVE-state polling.
  const base64Length = processedFile.base64Data?.length ?? 0;
  const useLargeFileUpload =
    (processedFile.contentType === "document" || processedFile.contentType === "image") &&
    base64Length > 4_000_000;

  if (useLargeFileUpload) {
    const fileUri = await uploadFileToGemini(
      apiKey,
      processedFile.base64Data!,
      processedFile.mediaType!,
      filename
    );
    parts.push({
      file_data: {
        mime_type: processedFile.mediaType!,
        file_uri: fileUri,
      },
    });
  } else if (processedFile.contentType === "document" || processedFile.contentType === "image") {
    parts.push({
      inline_data: {
        mime_type: processedFile.mediaType!,
        data: processedFile.base64Data!,
      },
    });
  } else {
    // Text content
    let textPayload = processedFile.textContent!;

    if (processedFile.preExtractedRows && processedFile.preExtractedRows.length > 0) {
      const rows = processedFile.preExtractedRows;
      const headCount = Math.min(20, rows.length);
      const tailCount = rows.length > headCount ? Math.min(10, rows.length - headCount) : 0;
      textPayload += `\n\n--- Pre-parsed CSV structure (${rows.length} total rows) ---\n`;
      textPayload += `First ${headCount} rows:\n${JSON.stringify(rows.slice(0, headCount), null, 2)}`;
      if (tailCount > 0) {
        textPayload += `\n\nLast ${tailCount} rows:\n${JSON.stringify(rows.slice(-tailCount), null, 2)}`;
      }
      textPayload += "\n--- End pre-parsed data. Map the columns above to the schema. ---\n\n";
    }

    parts.push({ text: textPayload });
  }

  // Gemini 3.x uses thinkingLevel (semantic); 2.x uses thinkingBudget (numeric).
  // Gemini 3: allow medium thinking for quality extraction.
  // Gemini 2.5: disable thinking so output tokens go to content, not reasoning.
  const isGemini3 = geminiModel.includes("gemini-3");
  const thinkingConfig: ThinkingConfig = isGemini3
    ? { thinkingLevel: thinkingLevelOverride ?? "low" }
    : { thinkingBudget: 0 };

  const requestBody: GeminiRequest = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig: {
      // Gemini 3 docs warn temperature:0 causes looping; omit for 3.x
      ...(isGemini3 ? {} : { temperature: 0 }),
      maxOutputTokens: 65536,
      mediaResolution: mediaResolutionOverride ?? "MEDIA_RESOLUTION_HIGH",
      thinkingConfig,
    },
  };

  // Use streaming endpoint to avoid Tier 1's ~60s server-side timeout.
  // streamGenerateContent keeps the connection alive with chunked responses.
  const url = `${GEMINI_API_URL}/${geminiModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const jsonBody = JSON.stringify(requestBody);

  // Adaptive timeout: if we have a deadline, compute remaining time minus a 10s buffer.
  // This prevents starting a long Gemini call when we've already spent 200s on file upload.
  // Falls back to 240s if no deadline is provided.
  const fetchTimeoutMs = deadlineMs
    ? Math.max(deadlineMs - Date.now() - 10_000, 30_000) // at least 30s, leave 10s buffer
    : 240_000;

  // Fetch with retry on transient errors (429, 503).
  const response = await withRetry(
    async () => {
      let resp: Response;
      try {
        resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: jsonBody,
          signal: AbortSignal.timeout(fetchTimeoutMs),
        });
      } catch (fetchErr) {
        const cause = fetchErr instanceof Error && 'cause' in fetchErr
          ? ` cause: ${(fetchErr as { cause?: unknown }).cause}`
          : "";
        throw new Error(
          `Gemini fetch failed (body size: ${(jsonBody.length / 1024).toFixed(0)} KB): ${fetchErr instanceof Error ? fetchErr.message : fetchErr}${cause}`
        );
      }

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => "Unknown error");
        throw new Error(`Gemini API error (${resp.status}): ${errorText}`);
      }
      return resp;
    },
    { maxAttempts: 3, baseDelayMs: 2000, label: "Gemini" }
  );

  // Collect SSE chunks into full text + metadata
  const { text: fullText, finishReason, usageMetadata, malformedChunks } = await collectSSEStream(response);

  if (!fullText) {
    throw new Error(`No text in Gemini response. Finish reason: ${finishReason ?? "unknown"}`);
  }

  if (finishReason && finishReason !== "STOP") {
    throw new Error(
      `Gemini response truncated (finishReason=${finishReason}). The document may be too large for this model.`
    );
  }

  // Validate against PortsieExtraction schema (Stage 2)
  const validationResult = validateExtraction(fullText);
  if (!validationResult.valid || !validationResult.extraction) {
    const errorSummary = validationResult.errors
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    throw new Error(
      `Extraction validation failed: ${errorSummary || "unknown error"}`
    );
  }

  // Persist validation warnings/coercions in extraction notes for traceability
  let extraction = validationResult.extraction;
  const extraNotes: string[] = [];

  if (validationResult.coercions.length > 0 || validationResult.warnings.length > 0) {
    extraNotes.push(
      ...validationResult.coercions.map((c) => `[Coercion] ${c}`),
      ...validationResult.warnings.map((w) => `[Warning] ${w.path}: ${w.message}`),
    );
  }

  if (malformedChunks > 5) {
    extraNotes.push(`[Warning] ${malformedChunks} malformed SSE chunks during streaming — extraction may be incomplete`);
  }

  if (extraNotes.length > 0) {
    extraction = {
      ...extraction,
      notes: [...(extraction.notes || []), ...extraNotes],
    };
  }

  return {
    extraction,
    observations: validationResult.observations,
    rawResponse: { text: fullText, finishReason, usageMetadata },
  };
}

// ── SSE stream collector ──

/**
 * Collect a Gemini streamGenerateContent SSE response into text + metadata.
 * Each SSE event is `data: <json>` with a GeminiResponse chunk.
 */
async function collectSSEStream(response: Response): Promise<{
  text: string;
  finishReason: string | undefined;
  usageMetadata: unknown;
  malformedChunks: number;
}> {
  const body = response.body;
  if (!body) throw new Error("No response body from Gemini stream");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let finishReason: string | undefined;
  let usageMetadata: unknown;
  let malformedChunks = 0;

  // Per-chunk timeout: if no data arrives for 90s, the connection is stalled.
  // The outer AbortSignal covers total time, but a stalled mid-stream connection
  // (server accepted but stopped sending) won't trigger it until the full 10 min.
  const CHUNK_TIMEOUT_MS = 90_000;
  while (true) {
    const chunkPromise = reader.read();
    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Gemini SSE stream stalled — no data for 90s")), CHUNK_TIMEOUT_MS);
    });
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await Promise.race([chunkPromise, timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
    const { done, value } = result;
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE lines
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep incomplete line in buffer

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "data: [DONE]") continue;
      if (!trimmed.startsWith("data: ")) continue;

      try {
        const chunk: GeminiResponse = JSON.parse(trimmed.slice(6));
        const candidate = chunk.candidates?.[0];
        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            // Skip thinking parts (Gemini 3 with thinkingLevel enabled)
            if ((part as { thought?: boolean }).thought) continue;
            if (part.text) fullText += part.text;
          }
        }
        if (candidate?.finishReason) finishReason = candidate.finishReason;
        if (chunk.usageMetadata) usageMetadata = chunk.usageMetadata;
      } catch {
        malformedChunks++;
        if (malformedChunks <= 3) {
          console.warn(`[Gemini] Malformed SSE chunk #${malformedChunks}: ${trimmed.slice(0, 100)}`);
        }
      }
    }
  }

  if (malformedChunks > 0) {
    console.warn(`[Gemini] Total malformed SSE chunks: ${malformedChunks}`);
  }

  return { text: fullText, finishReason, usageMetadata, malformedChunks };
}

// ── File API upload for large files ──

/**
 * Upload a file to Gemini's File API and return its URI.
 * Used for large PDFs/images that would exceed the inline body limit.
 */
async function uploadFileToGemini(
  apiKey: string,
  base64Data: string,
  mimeType: string,
  displayName: string
): Promise<string> {
  const buffer = Buffer.from(base64Data, "base64");

  // Resumable upload: initial request to get upload URI
  const initResp = await fetch(
    `${GEMINI_UPLOAD_URL}?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(buffer.length),
        "X-Goog-Upload-Header-Content-Type": mimeType,
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
      signal: AbortSignal.timeout(30_000), // 30s timeout for init
    }
  );

  if (!initResp.ok) {
    const errText = await initResp.text().catch(() => "Unknown");
    throw new Error(`Gemini File API init failed (${initResp.status}): ${errText}`);
  }

  const uploadUrl = initResp.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("No upload URL returned from Gemini File API");
  }

  // Upload the actual file bytes
  const uploadResp = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(buffer.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: buffer,
    signal: AbortSignal.timeout(60_000), // 60s timeout for upload
  });

  if (!uploadResp.ok) {
    const errText = await uploadResp.text().catch(() => "Unknown");
    throw new Error(`Gemini File API upload failed (${uploadResp.status}): ${errText}`);
  }

  const fileInfo = await uploadResp.json();
  const fileUri = fileInfo.file?.uri;
  if (!fileUri) {
    throw new Error(`No file URI in Gemini upload response: ${JSON.stringify(fileInfo).slice(0, 200)}`);
  }

  // Wait for file to be ACTIVE (processing can take a few seconds).
  // Tightened: 20 polls × (3s timeout + 500ms sleep) = 70s worst case (down from 110s).
  // Most files become ACTIVE in 1-3s, so this rarely loops more than 3-4 times.
  const fileName = fileInfo.file?.name;
  if (fileName) {
    for (let i = 0; i < 20; i++) {
      const statusResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
        { signal: AbortSignal.timeout(3_000) } // 3s timeout per status check
      );
      if (statusResp.ok) {
        const status = await statusResp.json();
        if (status.state === "ACTIVE") break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return fileUri;
}

// ── Gemini API types ──

interface GeminiPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
  file_data?: {
    mime_type: string;
    file_uri: string;
  };
}

// Gemini 2.x: thinkingBudget (0=off, -1=dynamic, or token count)
// Gemini 3.x: thinkingLevel ("minimal" | "low" | "medium" | "high")
// Cannot send both simultaneously — causes 400 error.
type ThinkingConfig =
  | { thinkingBudget: number; thinkingLevel?: never }
  | { thinkingLevel: "minimal" | "low" | "medium" | "high"; thinkingBudget?: never };

interface GeminiRequest {
  system_instruction?: {
    parts: { text: string }[];
  };
  contents: {
    role: string;
    parts: GeminiPart[];
  }[];
  generationConfig: {
    temperature?: number;
    maxOutputTokens: number;
    mediaResolution?: string;
    thinkingConfig?: ThinkingConfig;
  };
}

interface GeminiResponse {
  candidates?: {
    content?: {
      parts: { text?: string }[];
    };
    finishReason?: string;
  }[];
  usageMetadata?: unknown;
}
