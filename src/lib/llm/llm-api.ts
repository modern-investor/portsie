import Anthropic from "@anthropic-ai/sdk";
import { UPLOAD_CONFIG } from "../upload/config";
import { EXTRACTION_SYSTEM_PROMPT } from "./prompts";
import type { ProcessedFile } from "../upload/file-processor";
import type { LLMExtractionResult, UploadFileType } from "../upload/types";
import { parseAndValidateExtraction } from "./parse";

/**
 * API backend: uses @anthropic-ai/sdk with a per-user API key.
 * Extracted from the original llm-client.ts.
 */
export async function extractViaAPI(
  apiKey: string,
  processedFile: ProcessedFile,
  fileType: UploadFileType,
  filename: string
): Promise<{ result: LLMExtractionResult; rawResponse: unknown }> {
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
      const sampleCount = Math.min(5, processedFile.preExtractedRows.length);
      textPayload += `\n\n--- Pre-parsed data (${processedFile.preExtractedRows.length} total rows, showing first ${sampleCount}) ---\n`;
      textPayload += JSON.stringify(
        processedFile.preExtractedRows.slice(0, sampleCount),
        null,
        2
      );
      if (processedFile.preExtractedRows.length > sampleCount) {
        textPayload += `\n... and ${processedFile.preExtractedRows.length - sampleCount} more rows`;
      }
    }

    contentBlocks.push({ type: "text", text: textPayload });
  }

  const response = await client.messages.create({
    model: UPLOAD_CONFIG.claudeModel,
    max_tokens: UPLOAD_CONFIG.claudeMaxTokens,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: contentBlocks }],
  });

  // Extract the text response
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude API");
  }

  const result = parseAndValidateExtraction(textBlock.text);
  return { result, rawResponse: response };
}
