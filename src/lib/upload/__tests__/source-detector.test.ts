import { describe, expect, it } from "vitest";
import { detectUploadSource } from "../source-detector";

describe("detectUploadSource", () => {
  it("detects PDF statements with high confidence", () => {
    const buffer = Buffer.from("%PDF-1.7 sample content");
    const result = detectUploadSource("statement.pdf", "application/pdf", buffer);
    expect(result.kind).toBe("brokerage_statement_pdf");
    expect(result.confidence).toBe("high");
    expect(result.structureSignature.startsWith("pdf:")).toBe(true);
  });

  it("detects OFX payloads", () => {
    const buffer = Buffer.from("<OFX><INVTRANLIST><BUYMF>...</BUYMF></INVTRANLIST></OFX>");
    const result = detectUploadSource("export.ofx", "application/x-ofx", buffer);
    expect(result.kind).toBe("ofx_qfx");
    expect(result.confidence).toBe("high");
  });

  it("detects transaction-style CSV", () => {
    const csv = "transaction_date,description,amount\n2026-01-01,Deposit,100";
    const result = detectUploadSource("tx.csv", "text/csv", Buffer.from(csv));
    expect(result.kind).toBe("transactions_csv");
    expect(result.structureSignature.startsWith("csv_tx:")).toBe(true);
  });

  it("falls back to unknown for opaque binary", () => {
    const result = detectUploadSource(
      "file.bin",
      "application/octet-stream",
      Buffer.from([0xde, 0xad, 0xbe, 0xef])
    );
    expect(result.kind).toBe("unknown");
    expect(result.confidence).toBe("low");
  });
});
