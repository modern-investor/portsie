import type { PortsieExtraction } from "../schema";
import type { IngestionAdapter, IngestionAdapterInput, AdapterOutput } from "./types";

function isPortsieExtraction(payload: unknown): payload is PortsieExtraction {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.schema_version === "number" &&
    Array.isArray(candidate.accounts) &&
    Array.isArray(candidate.unallocated_positions)
  );
}

export class UploadExtractionAdapter implements IngestionAdapter {
  public readonly sourceKey = "upload_document";

  supports(input: IngestionAdapterInput): boolean {
    return input.kind.startsWith("upload_");
  }

  async normalize(input: IngestionAdapterInput): Promise<AdapterOutput> {
    if (isPortsieExtraction(input.payload)) {
      return {
        extraction: input.payload,
        observations: [],
        diagnostics: { adapter: "upload", passthrough: true },
      };
    }

    return {
      extraction: null,
      observations: [
        {
          path: "$",
          value: { payloadType: typeof input.payload },
          confidence: "medium",
        },
      ],
      diagnostics: { adapter: "upload", passthrough: false },
    };
  }
}
