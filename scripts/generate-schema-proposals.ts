import { createClient } from "@supabase/supabase-js";
import {
  buildSchemaProposalKey,
  computeSchemaProposalRiskScore,
} from "../src/lib/extraction/schema-proposals";

type ObservationRow = {
  source_id: string;
  field_path: string;
  observed_type: string | null;
  confidence: "high" | "medium" | "low" | null;
};

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from("ingestion_observations")
    .select("source_id, field_path, observed_type, confidence")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    throw new Error(`Failed to read observations: ${error.message}`);
  }

  const grouped = new Map<string, { row: ObservationRow; count: number }>();
  for (const row of (data ?? []) as ObservationRow[]) {
    const key = buildSchemaProposalKey(row.source_id, row.field_path, row.observed_type);
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      grouped.set(key, { row, count: 1 });
    }
  }

  if (grouped.size === 0) {
    console.log("No observations found. No proposals generated.");
    return;
  }

  const now = new Date().toISOString();
  const proposalRows = Array.from(grouped.entries()).map(([key, value]) => {
    const risk = computeSchemaProposalRiskScore(value.count, value.row.confidence);
    return {
      proposal_key: key,
      status: "open",
      proposal_type: "new_field",
      rationale: `Observed unmapped path "${value.row.field_path}" ${value.count} time(s).`,
      evidence_count: value.count,
      risk_score: risk,
      proposal_payload: {
        source_id: value.row.source_id,
        field_path: value.row.field_path,
        observed_type: value.row.observed_type,
        confidence: value.row.confidence,
        generated_at: now,
      },
      updated_at: now,
    };
  });

  const { error: upsertError } = await supabase
    .from("schema_change_proposals")
    .upsert(proposalRows, { onConflict: "proposal_key" });

  if (upsertError) {
    throw new Error(`Failed to upsert proposals: ${upsertError.message}`);
  }

  console.log(`Upserted ${proposalRows.length} schema proposal(s).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
