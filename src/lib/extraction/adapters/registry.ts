import type { IngestionAdapter, IngestionAdapterInput } from "./types";

export class AdapterRegistry {
  constructor(private readonly adapters: IngestionAdapter[]) {}

  resolve(input: IngestionAdapterInput): IngestionAdapter {
    const adapter = this.adapters.find((candidate) => candidate.supports(input));
    if (!adapter) {
      throw new Error(`No adapter registered for kind "${input.kind}"`);
    }
    return adapter;
  }
}
