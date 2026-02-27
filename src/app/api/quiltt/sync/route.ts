import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getQuilttProfileId } from "@/lib/quiltt/session";
import { syncAllQuilttAccounts } from "@/lib/quiltt/sync";
import {
  completeIngestionRun,
  failIngestionRun,
  startIngestionRun,
} from "@/lib/extraction/ingestion-runs";
import { AdapterRegistry } from "@/lib/extraction/adapters/registry";
import { QuilttSyncAdapter } from "@/lib/extraction/adapters/quiltt-adapter";
import { persistObservations } from "@/lib/extraction/governance";

/**
 * POST /api/quiltt/sync
 * Triggers a manual sync of all Quiltt-linked accounts for the user.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runId = await startIngestionRun(supabase, {
    userId: user.id,
    sourceKey: "quiltt_sync",
    runKind: "api_sync",
  });

  try {
    const profileId = await getQuilttProfileId(supabase, user.id);
    if (!profileId) {
      if (runId) {
        await failIngestionRun(supabase, {
          runId,
          errorCategory: "missing_profile",
          errorMessage: "No Quiltt profile found",
        });
      }
      return NextResponse.json(
        { error: "No Quiltt profile found. Connect a bank account first." },
        { status: 404 }
      );
    }

    const result = await syncAllQuilttAccounts(supabase, user.id, profileId);
    const registry = new AdapterRegistry([new QuilttSyncAdapter()]);
    const adapter = registry.resolve({ kind: "quiltt_sync", payload: result });
    const adapted = await adapter.normalize({ kind: "quiltt_sync", payload: result });
    await persistObservations(supabase, {
      ingestionRunId: runId,
      userId: user.id,
      sourceKey: "quiltt_sync",
      observations: adapted.observations,
      maxRows: 25,
    });

    if (runId) {
      await completeIngestionRun(supabase, {
        runId,
        diagnostics: {
          profileId,
          accounts: result.accounts,
          totalHoldings: result.totalHoldings,
          totalTransactions: result.totalTransactions,
        },
      });
    }

    return NextResponse.json({
      message: "Sync complete",
      ...result,
    });
  } catch (error) {
    console.error("Failed to sync Quiltt accounts:", error);
    if (runId) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to sync accounts";
      await failIngestionRun(supabase, {
        runId,
        errorCategory: "quiltt_sync_failed",
        errorMessage,
      });
    }
    return NextResponse.json(
      { error: "Failed to sync accounts" },
      { status: 500 }
    );
  }
}
