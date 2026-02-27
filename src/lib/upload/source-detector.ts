import { createHash } from "crypto";

export type DetectedUploadKind =
  | "brokerage_statement_pdf"
  | "transactions_csv"
  | "positions_csv"
  | "ofx_qfx"
  | "api_json_export"
  | "image_statement"
  | "plain_text_statement"
  | "unknown";

export interface UploadDetectionResult {
  kind: DetectedUploadKind;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  structureSignature: string;
}

function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function looksLikeCsv(text: string): boolean {
  const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 5);
  if (lines.length < 2) return false;
  const delimiters = [",", "\t", ";"];
  return delimiters.some((delimiter) =>
    lines.every((line) => line.includes(delimiter))
  );
}

function csvHeader(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  return line.trim().toLowerCase();
}

function jsonTopLevelKeySignature(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed as Record<string, unknown>).sort();
      return keys.join("|");
    }
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null) {
      const keys = Object.keys(parsed[0] as Record<string, unknown>).sort();
      return `[array]${keys.join("|")}`;
    }
  } catch {
    // Fall through
  }
  return "unknown_json_shape";
}

export function detectUploadSource(
  filename: string,
  mimeType: string,
  buffer: Buffer
): UploadDetectionResult {
  const reasons: string[] = [];
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const textPrefix = buffer.toString("utf8", 0, Math.min(buffer.length, 4096));

  if (buffer.toString("ascii", 0, 4) === "%PDF") {
    reasons.push("pdf_magic_bytes");
    return {
      kind: "brokerage_statement_pdf",
      confidence: "high",
      reasons,
      structureSignature: "pdf:" + shortHash(`${mimeType}|${ext}|pdf`),
    };
  }

  if (/^image\/(png|jpeg)/.test(mimeType) || ["png", "jpg", "jpeg"].includes(ext)) {
    reasons.push("image_mime_or_ext");
    return {
      kind: "image_statement",
      confidence: "medium",
      reasons,
      structureSignature: "image:" + shortHash(`${mimeType}|${ext}`),
    };
  }

  if (/<OFX>|<BANKTRANLIST>|<INVTRANLIST>/i.test(textPrefix) || ["ofx", "qfx"].includes(ext)) {
    reasons.push("ofx_tags_or_ext");
    return {
      kind: "ofx_qfx",
      confidence: "high",
      reasons,
      structureSignature: "ofx:" + shortHash(textPrefix.replace(/\s+/g, "").slice(0, 500)),
    };
  }

  if (mimeType === "application/json" || ext === "json" || textPrefix.trim().startsWith("{") || textPrefix.trim().startsWith("[")) {
    reasons.push("json_shape");
    const keySig = jsonTopLevelKeySignature(textPrefix);
    return {
      kind: "api_json_export",
      confidence: "medium",
      reasons,
      structureSignature: "json:" + shortHash(keySig),
    };
  }

  if (looksLikeCsv(textPrefix) || mimeType === "text/csv" || ext === "csv") {
    const header = csvHeader(textPrefix);
    reasons.push("csv_heuristic");
    const txMarkers = ["transaction", "amount", "debit", "credit", "settlement", "description"];
    const posMarkers = ["symbol", "ticker", "quantity", "market value", "cost basis"];
    const txScore = txMarkers.filter((m) => header.includes(m)).length;
    const posScore = posMarkers.filter((m) => header.includes(m)).length;

    if (posScore > txScore) {
      return {
        kind: "positions_csv",
        confidence: "medium",
        reasons,
        structureSignature: "csv_pos:" + shortHash(header),
      };
    }

    return {
      kind: "transactions_csv",
      confidence: "medium",
      reasons,
      structureSignature: "csv_tx:" + shortHash(header),
    };
  }

  if (mimeType === "text/plain" || ext === "txt") {
    reasons.push("plain_text");
    return {
      kind: "plain_text_statement",
      confidence: "low",
      reasons,
      structureSignature: "txt:" + shortHash(textPrefix.slice(0, 500)),
    };
  }

  return {
    kind: "unknown",
    confidence: "low",
    reasons: ["no_signature_match"],
    structureSignature: "unknown:" + shortHash(`${mimeType}|${ext}|${buffer.length}`),
  };
}
