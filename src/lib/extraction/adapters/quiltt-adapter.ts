import type { IngestionAdapter, IngestionAdapterInput, AdapterOutput } from "./types";
import type { PortsieExtraction } from "../schema";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export class QuilttSyncAdapter implements IngestionAdapter {
  public readonly sourceKey = "quiltt_sync";

  supports(input: IngestionAdapterInput): boolean {
    return input.kind === "quiltt_sync";
  }

  async normalize(input: IngestionAdapterInput): Promise<AdapterOutput> {
    const payload = (input.payload ?? {}) as Record<string, unknown>;
    const extraction: PortsieExtraction = {
      schema_version: 1,
      document: {
        institution_name: "Quiltt",
        document_type: "csv_export",
        statement_start_date: todayIsoDate(),
        statement_end_date: todayIsoDate(),
      },
      accounts: [],
      unallocated_positions: [],
      confidence: "medium",
      notes: ["Generated from Quiltt sync summary payload"],
    };

    return {
      extraction,
      observations: [
        {
          path: "quiltt_sync.summary",
          value: payload,
          confidence: "low",
        },
      ],
      diagnostics: { adapter: "quiltt", normalized: false },
    };
  }
}
