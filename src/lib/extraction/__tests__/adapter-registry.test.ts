import { describe, expect, it } from "vitest";
import { AdapterRegistry } from "../adapters/registry";
import { UploadExtractionAdapter } from "../adapters/upload-adapter";

describe("AdapterRegistry", () => {
  it("resolves upload adapter for upload kinds", async () => {
    const registry = new AdapterRegistry([new UploadExtractionAdapter()]);
    const adapter = registry.resolve({ kind: "upload_transactions_csv", payload: {} });
    const output = await adapter.normalize({ kind: "upload_transactions_csv", payload: {} });
    expect(adapter.sourceKey).toBe("upload_document");
    expect(Array.isArray(output.observations)).toBe(true);
  });

  it("throws when no adapter matches", () => {
    const registry = new AdapterRegistry([new UploadExtractionAdapter()]);
    expect(() =>
      registry.resolve({ kind: "quiltt_sync", payload: {} })
    ).toThrow("No adapter registered");
  });
});
