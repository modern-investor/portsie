import type { PortsieExtraction } from "../schema";

export interface IngestionObservation {
  path: string;
  value: unknown;
  confidence: "high" | "medium" | "low";
}

export interface AdapterOutput {
  extraction: PortsieExtraction | null;
  observations: IngestionObservation[];
  diagnostics?: Record<string, unknown>;
}

export interface IngestionAdapterInput {
  kind: string;
  payload: unknown;
  metadata?: Record<string, unknown>;
}

export interface IngestionAdapter {
  sourceKey: string;
  supports(input: IngestionAdapterInput): boolean;
  normalize(input: IngestionAdapterInput): Promise<AdapterOutput>;
}
