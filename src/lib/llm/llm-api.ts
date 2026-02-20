import Anthropic from "@anthropic-ai/sdk";
import { UPLOAD_CONFIG } from "../upload/config";
import { buildExtractionPrompt } from "./prompts";
import type { ProcessedFile } from "../upload/file-processor";
import type { UploadFileType } from "../upload/types";
import type { PortsieExtraction } from "../extraction/schema";
import { validateExtraction } from "../extraction/validate";

/**
 * API backend: uses @anthropic-ai/sdk with a per-user API key.
 * Returns a validated PortsieExtraction and the raw API response.
 */
export async function extractViaAPI(
  apiKey: string,
  processedFile: ProcessedFile,
  fileType: UploadFileType,
  filename: string
): Promise<{ extraction: PortsieExtraction; rawResponse: unknown }> {
  const client = new Anthropic({ apiKey });

  // Build content blocks for the user message
  const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

  // Context about the file
  contentBlocks.push({
    type: "text",
    text: `Extract financial data from this ${fileType.toUpperCase()} file named "${filename}".`,
  });

  // File content based on its processed type
  if (processedFile.contentType === "document") {
    contentBlocks.push({
      type: "document",
      source: {
        type: "base64",
        media_type: processedFile.mediaType as "application/pdf",
        data: processedFile.base64Data!,
      },
    });
  } else if (processedFile.contentType === "image") {
    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: processedFile.mediaType as
          | "image/png"
          | "image/jpeg"
          | "image/gif"
          | "image/webp",
        data: processedFile.base64Data!,
      },
    });
  } else {
    // Text content
    let textPayload = processedFile.textContent!;

    // For CSV files, include pre-parsed row samples for better extraction
    if (
      processedFile.preExtractedRows &&
      processedFile.preExtractedRows.length > 0
    ) {
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

    contentBlocks.push({ type: "text", text: textPayload });
  }

  const response = await client.messages.create({
    model: UPLOAD_CONFIG.claudeModel,
    max_tokens: UPLOAD_CONFIG.claudeMaxTokens,
    temperature: 0,
    system: buildExtractionPrompt(),
    messages: [{ role: "user", content: contentBlocks }],
  });

  // Extract the text response
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude API");
  }

  // Validate against PortsieExtraction schema (Stage 2)
  const validationResult = validateExtraction(textBlock.text);
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

  return { extraction, rawResponse: response };
}
