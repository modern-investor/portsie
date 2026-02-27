export function buildSchemaProposalKey(
  sourceId: string,
  fieldPath: string,
  observedType: string | null
): string {
  return `${sourceId}:${fieldPath}:${observedType ?? "unknown"}`;
}

export function computeSchemaProposalRiskScore(
  evidenceCount: number,
  confidence: string | null
): number {
  const base = evidenceCount >= 20 ? 80 : evidenceCount >= 10 ? 60 : evidenceCount >= 5 ? 40 : 20;
  const confidenceBoost = confidence === "high" ? 15 : confidence === "medium" ? 5 : 0;
  return Math.min(100, base + confidenceBoost);
}
