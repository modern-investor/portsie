import * as XLSX from "xlsx";
import { parse as csvParse } from "csv-parse/sync";
import type { UploadFileType } from "./types";

/**
 * Represents a file that has been pre-processed and is ready for the Claude API.
 *
 * - `document`: PDF files — sent as base64 document content blocks
 * - `image`: PNG/JPG files — sent as base64 image content blocks
 * - `text`: CSV/XLSX/OFX/QFX/TXT — sent as text content
 */
export interface ProcessedFile {
  contentType: "document" | "image" | "text";
  /** Base64-encoded file data (for document and image types) */
  base64Data?: string;
  /** MIME type string (for document and image types) */
  mediaType?: string;
  /** Plain text content (for text types) */
  textContent?: string;
  /** Pre-parsed CSV/XLSX rows for additional context */
  preExtractedRows?: Record<string, unknown>[];
}

/**
 * Pre-processes a file buffer for consumption by the Claude API.
 * Different file types are handled differently:
 * - PDF: sent natively as a document content block
 * - PNG/JPG: sent natively as an image content block
 * - XLSX: converted to CSV text via SheetJS
 * - CSV: parsed into rows and also sent as raw text
 * - OFX/QFX/TXT: sent as plain text
 */
export function processFileForLLM(
  fileBuffer: Buffer,
  fileType: UploadFileType,
  mimeType: string
): ProcessedFile {
  switch (fileType) {
    case "pdf":
      return {
        contentType: "document",
        base64Data: fileBuffer.toString("base64"),
        mediaType: "application/pdf",
      };

    case "png":
    case "jpg":
      return {
        contentType: "image",
        base64Data: fileBuffer.toString("base64"),
        mediaType: mimeType,
      };

    case "xlsx": {
      const workbook = XLSX.read(fileBuffer, { type: "buffer" });
      const sheets: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        sheets.push(`=== Sheet: ${sheetName} ===\n${csv}`);
      }
      return {
        contentType: "text",
        textContent: sheets.join("\n\n"),
      };
    }

    case "csv": {
      const csvText = fileBuffer.toString("utf-8");
      let rows: Record<string, unknown>[] = [];
      try {
        rows = csvParse(csvText, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });
      } catch {
        // If CSV parsing fails, we still send the raw text
      }
      return {
        contentType: "text",
        textContent: csvText,
        preExtractedRows: rows.length > 0 ? rows : undefined,
      };
    }

    case "ofx":
    case "qfx":
      return {
        contentType: "text",
        textContent: fileBuffer.toString("utf-8"),
      };

    case "txt":
      return {
        contentType: "text",
        textContent: fileBuffer.toString("utf-8"),
      };

    case "json":
      return {
        contentType: "text",
        textContent: fileBuffer.toString("utf-8"),
      };

    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}
