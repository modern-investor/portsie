import { buildExtractionPrompt } from "./prompts";
import type { ProcessedFile } from "../upload/file-processor";
import type { UploadFileType } from "../upload/types";
import type { PortsieExtraction } from "../extraction/schema";
import { validateExtraction } from "../extraction/validate";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const DEFAULT_MODEL = "gemini-3-flash-preview";

/**
 * Gemini Flash backend: uses the Google Generative Language REST API.
 * Default extraction engine — same prompt as Claude backends, validated
 * through the same PortsieExtraction schema.
 *
 * For large binary files (>400 KB base64), uses the File API to upload
 * the file first, then references it by URI. This avoids Gemini's ~512 KB
 * inline request body limit.
 */
export async function extractViaGemini(
  apiKey: string,
  processedFile: ProcessedFile,
  fileType: UploadFileType,
  filename: string,
  model?: string
): Promise<{ extraction: PortsieExtraction; rawResponse: unknown }> {
  const geminiModel = model || DEFAULT_MODEL;
  const systemPrompt = buildExtractionPrompt();

  // Build content parts for the user message
  const parts: GeminiPart[] = [];

  parts.push({
    text: `Extract financial data from this ${fileType.toUpperCase()} file named "${filename}". You MUST extract EVERY account — do NOT summarize, abbreviate, or select a representative subset. Include ALL accounts even if there are dozens. Respond ONLY with the JSON object.`,
  });

  // For large binary files, upload via File API to avoid body size limits
  const base64Length = processedFile.base64Data?.length ?? 0;
  const useLargeFileUpload =
    (processedFile.contentType === "document" || processedFile.contentType === "image") &&
    base64Length > 400_000;

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
      textPayload += "\n--- End pre-parsed data. Map the columns above to the schema. ---\n";
    }

    parts.push({ text: textPayload });
  }

  // Gemini 3.x uses thinkingLevel (semantic); 2.x uses thinkingBudget (numeric).
  // Gemini 3: allow medium thinking for quality extraction.
  // Gemini 2.5: disable thinking so output tokens go to content, not reasoning.
  const isGemini3 = geminiModel.includes("gemini-3");
  const thinkingConfig: ThinkingConfig = isGemini3
    ? { thinkingLevel: "medium" }
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
      // High resolution for PDFs with dense tables/charts (1120 tokens/page vs 560 default)
      mediaResolution: "MEDIA_RESOLUTION_HIGH",
      thinkingConfig,
    },
  };

  // Use streaming endpoint to avoid Tier 1's ~60s server-side timeout.
  // streamGenerateContent keeps the connection alive with chunked responses.
  const url = `${GEMINI_API_URL}/${geminiModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const jsonBody = JSON.stringify(requestBody);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonBody,
      signal: AbortSignal.timeout(600_000), // 10 min for large extractions
    });
  } catch (fetchErr) {
    const cause = fetchErr instanceof Error && 'cause' in fetchErr
      ? ` cause: ${(fetchErr as { cause?: unknown }).cause}`
      : "";
    throw new Error(
      `Gemini fetch failed (body size: ${(jsonBody.length / 1024).toFixed(0)} KB): ${fetchErr instanceof Error ? fetchErr.message : fetchErr}${cause}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  // Collect SSE chunks into full text + metadata
  const { text: fullText, finishReason, usageMetadata } = await collectSSEStream(response);

  if (!fullText) {
    throw new Error(`No text in Gemini response. Finish reason: ${finishReason ?? "unknown"}`);
  }

  if (finishReason && finishReason !== "STOP") {
    console.warn(`[Gemini] Warning: finishReason=${finishReason} — response may be truncated`);
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

  let extraction = validationResult.extraction;
  if (validationResult.coercions.length > 0 || validationResult.warnings.length > 0) {
    const validationNotes = [
      ...validationResult.coercions.map((c) => `[Coercion] ${c}`),
      ...validationResult.warnings.map((w) => `[Warning] ${w.path}: ${w.message}`),
    ];
    extraction = {
      ...extraction,
      notes: [...(extraction.notes || []), ...validationNotes],
    };
  }

  const rawResponse = { text: fullText, finishReason, usageMetadata };
  return { extraction, rawResponse };
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
}> {
  const body = response.body;
  if (!body) throw new Error("No response body from Gemini stream");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let finishReason: string | undefined;
  let usageMetadata: unknown;

  while (true) {
    const { done, value } = await reader.read();
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
            if (part.text) fullText += part.text;
          }
        }
        if (candidate?.finishReason) finishReason = candidate.finishReason;
        if (chunk.usageMetadata) usageMetadata = chunk.usageMetadata;
      } catch {
        // Skip malformed chunks
      }
    }
  }

  return { text: fullText, finishReason, usageMetadata };
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

  // Wait for file to be ACTIVE (processing can take a few seconds)
  const fileName = fileInfo.file?.name;
  if (fileName) {
    for (let i = 0; i < 10; i++) {
      const statusResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`
      );
      if (statusResp.ok) {
        const status = await statusResp.json();
        if (status.state === "ACTIVE") break;
      }
      await new Promise((r) => setTimeout(r, 1000));
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
