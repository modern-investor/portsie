# Portsie — Product Design Decisions

Living document for product-level decisions that shape architecture, cost, and user experience.

---

## Document Extraction Engine

### Decision: Gemini 3 Flash as Default (Feb 2026)

**Status**: Implemented
**Migration**: `20260218200000_gemini_default_backend.sql`

#### Context

Portsie processes uploaded financial documents (PDF, CSV, Excel, images) through an LLM to extract structured data — accounts, positions, transactions, and balances. Choosing the right extraction engine affects cost, speed, accuracy, and reliability at scale.

#### Options Evaluated

Five backends were A/B tested against the same 54-account Schwab portfolio PDF (representative of the most complex real-world input):

| Backend | Model | Time | Quality | Cost/Extraction |
|---------|-------|------|---------|-----------------|
| Gemini 3 Flash | `gemini-3-flash-preview` | 94s | Matches Opus | ~$0.018 |
| Gemini 2.5 Flash | `gemini-2.5-flash` | 99s | Good data, weak metadata | ~$0.004 |
| Claude Opus 4.6 | `claude-opus-4-6` | 224s | Gold standard | ~$3.71 (API) |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | 210s | Near-Opus | ~$0.86 (API) |
| Claude Sonnet 4.5 | `claude-sonnet-4-5-20250929` | 224s | Near-Opus | ~$0.86 (API) |

All Claude models also available at zero marginal cost via CLI wrapper (Max plan).

#### Quality Comparison (Gemini 3 vs 2.5 vs Opus)

| Field | Gemini 3 Flash | Gemini 2.5 Flash | Claude Opus 4.6 |
|-------|---------------|-----------------|-----------------|
| Balances (cash/equity) | 100% match | 100% match | 100% match |
| Institution name | 100% | 53.7% | 100% |
| Account naming | Exact match | 87% (adds spaces) | Reference |
| Account type | 70.4% | 61.1% | 77.8% |
| Position quantities | 100% | 100% | 100% |
| Output size | 33 KB | 69 KB | 38 KB |

#### Decision

**Gemini 3 Flash** as the default extraction engine, with automatic fallback to **Claude Sonnet 4.6 via CLI wrapper**.

#### Rationale

1. **Quality parity with Opus**: Gemini 3 Flash matches Claude Opus 4.6 on all critical fields (balances, institution names, position data) at a fraction of the cost.

2. **Cost at scale**: At 100K users × 10 docs/month (1M extractions), quarterly cost documents are ~1/4 the size of the test file:

   | Backend | Monthly Cost (1M extractions) | Annual |
   |---------|------------------------------|--------|
   | Gemini 3 Flash | ~$18,000 | $216K |
   | Gemini 2.5 Flash | ~$4,000 | $48K |
   | Claude Sonnet (API) | ~$220,000 | $2.6M |
   | Claude Opus (API) | ~$930,000 | $11.2M |

3. **Speed**: 2.4x faster than Claude (94s vs 224s). Better UX for users waiting on extraction.

4. **Reliability via fallback**: If Gemini fails (503, timeout, API issues), the dispatcher automatically retries with Claude Sonnet 4.6 via the CLI wrapper (Max plan, zero marginal cost). Users never see a failure.

5. **Why not Gemini 2.5?** The $14K/month savings ($168K/yr) isn't worth the metadata quality drop — 53.7% institution name accuracy means users would need to manually fix half their accounts. Gemini 3's 100% accuracy eliminates this friction.

6. **Two-pass (2.5 data + 3.0 metadata) rejected**: The metadata model still needs to read the full PDF, so input tokens are paid twice. Total cost (~$0.017) is basically the same as a single G3.0 pass, with added complexity and merge risk.

#### Architecture

```
User uploads document
        │
        ▼
  ┌─────────────┐
  │  Dispatcher  │  reads user's llm_settings (default: "gemini")
  └──────┬──────┘
         │
    ┌────┴────┐
    │ gemini  │ ← default: Gemini 3 Flash (server-side GEMINI_API_KEY)
    └────┬────┘
         │ on failure
    ┌────┴────┐
    │   cli   │ ← fallback: Claude Sonnet 4.6 via DO CLI wrapper
    └─────────┘

User overrides (Settings → LLM tab):
  • "cli"   → Claude Sonnet 4.6 via CLI (no fallback, Max plan)
  • "api"   → Anthropic API with user's own key (per-token billing)
  • "gemini"→ Gemini 3 Flash with CLI fallback (default)
```

#### Gemini Configuration (Critical)

These settings were determined through extensive debugging during A/B testing:

- **Thinking**: `thinkingLevel: "medium"` for Gemini 3.x (NOT `thinkingBudget` — that's 2.x only)
- **Temperature**: Omit for Gemini 3 (default). `temperature: 0` causes looping.
- **Streaming**: Use `streamGenerateContent?alt=sse` — required to avoid Tier 1's ~60s server timeout
- **Resolution**: `mediaResolution: "MEDIA_RESOLUTION_HIGH"` for dense PDF tables
- **Output tokens**: `maxOutputTokens: 65536` for large multi-account extractions
- **Anti-summarization prompt**: "You MUST extract EVERY account — do NOT summarize"

See `src/lib/llm/llm-gemini.ts` for implementation.

#### Test Results

Full HTML reports and raw JSON are published at `portsie.com/extracttests/`. Test runner: `scripts/run-extract-test.ts`.

---

## User Settings Philosophy

### LLM Backend Override

Users can override the default extraction engine in Settings → LLM tab. Three options:

1. **Gemini Flash** (default) — best balance of cost, speed, and quality
2. **Claude CLI** — for users who prefer Claude or want zero marginal cost via Max plan
3. **Anthropic API** — for users who want to use their own API key with per-token billing

The default should "just work" for 99% of users. Advanced users can switch if they have specific preferences or compliance requirements.
