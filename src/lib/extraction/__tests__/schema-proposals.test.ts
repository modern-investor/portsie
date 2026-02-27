import { describe, expect, it } from "vitest";
import {
  buildSchemaProposalKey,
  computeSchemaProposalRiskScore,
} from "../schema-proposals";

describe("schema proposal helpers", () => {
  it("builds deterministic proposal keys", () => {
    const keyA = buildSchemaProposalKey("src1", "accounts[0].foo", "string");
    const keyB = buildSchemaProposalKey("src1", "accounts[0].foo", "string");
    expect(keyA).toBe(keyB);
  });

  it("increases risk score for stronger evidence and confidence", () => {
    const low = computeSchemaProposalRiskScore(2, "low");
    const medium = computeSchemaProposalRiskScore(8, "medium");
    const high = computeSchemaProposalRiskScore(25, "high");
    expect(low).toBeLessThan(medium);
    expect(medium).toBeLessThan(high);
  });
});
