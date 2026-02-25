# Assets Dashboard AI Views Review

Date: 2026-02-26
Scope reviewed:
- `src/app/dashboard/components/portfolio-view.tsx`
- `src/app/dashboard/components/ai-suggestions-panel.tsx`
- `src/app/dashboard/components/dynamic-view-wrapper.tsx`
- `src/app/api/portfolio/ai-views/generate/route.ts`
- `src/app/api/portfolio/ai-views/route.ts`
- `src/lib/llm/ai-views.ts`
- `src/lib/portfolio/component-renderer.ts`
- `src/lib/portfolio/serialize.ts`
- `src/app/api/portfolio/positions/route.ts`

## Findings (bugs/problems) and suggested fixes

### 1) AI generation uses different portfolio data than the dashboard (high)
**What happens**
- The dashboard displays data from `GET /api/portfolio/positions` (includes Schwab live data, aggregate handling, cached market-price enrichment, discrepancy logic).
- AI generation uses `fetchPortfolioDataDirect()` inside `POST /api/portfolio/ai-views/generate`, which queries DB directly and excludes major logic from `positions` route.
- Result: AI views can be generated from stale/incomplete data versus what the user currently sees.

**Where**
- `src/app/api/portfolio/ai-views/generate/route.ts` (`fetchPortfolioDataDirect`)
- `src/app/api/portfolio/positions/route.ts` (main portfolio truth used by UI)

**User impact**
- Investor may trust a view built on different numbers/holdings than the visible dashboard.
- Suggestions can miss risk concentrations that are present in aggregate/live data.

**Suggested fix**
- Refactor shared portfolio assembly into a reusable server module (single source of truth), then call that from both routes.
- If full refactor is not immediate, make generate route call an internal shared function that mirrors `positions` logic exactly (including aggregate merge and price enrichment).

---

### 2) Aggregate-only portfolios can fail AI generation (high)
**What happens**
- `fetchPortfolioDataDirect()` explicitly filters accounts with `.eq("is_aggregate", false)` and returns empty `aggregate*` arrays.
- If a user only has aggregate holdings (or mostly aggregate holdings), generation may return "No portfolio data available" even when dashboard shows useful data.

**Where**
- `src/app/api/portfolio/ai-views/generate/route.ts` (`fetchPortfolioDataDirect`)

**User impact**
- Broken feature for users importing statements that land in aggregate accounts.

**Suggested fix**
- Include aggregate accounts/holdings in generation input, then apply same merge logic used by `positions` route.

---

### 3) Silent failure when both providers return no suggestions (high UX)
**What happens**
- If Gemini/Sonnet suggestion calls fail but request still returns HTTP 200 with `providerErrors`, UI sets `suggestions=[]`.
- Panel only shows provider-specific error details inside a block gated by `hasAnySuggestions`.
- Net effect: user can click generate, wait 60-90s, and end with an apparently empty panel and little/no actionable error context.

**Where**
- `src/app/dashboard/components/ai-suggestions-panel.tsx`

**User impact**
- Confusing "nothing happened" experience and repeated retries.

**Suggested fix**
- If `suggestions.length === 0` and `providerErrors` exists, show a top-level error card with provider-specific details and a direct retry action.
- Server-side: if both providers fail and no built-in view can be produced, return non-2xx with structured error payload.

---

### 4) Potential duplicate/overlapping generations (medium)
**What happens**
- No server lock/idempotency key; rapid clicks or multiple tabs can trigger concurrent generation runs.
- Current flow deletes old rows then inserts new rows, so overlapping calls can race and produce inconsistent final state.

**Where**
- `src/app/api/portfolio/ai-views/generate/route.ts`

**User impact**
- Inconsistent suggestion set, confusing refresh behavior, avoidable LLM cost.

**Suggested fix**
- Add per-user generation lock (DB row/advisory lock/in-progress flag).
- Add short-lived idempotency key based on `user_id + portfolio_hash`.

---

### 5) Dynamic code execution sandbox is not hard security isolation (high security risk)
**What happens**
- AI-generated component bodies run via `new Function(...)` in the browser.
- Regex-based forbidden checks are bypassable in principle and cannot guarantee containment against all JS gadget patterns.
- Prompt-injection risk exists because portfolio content is fed into LLM prompts, and generated code is then executed.

**Where**
- `src/lib/portfolio/component-renderer.ts`
- Prompt/data flow in `src/lib/llm/ai-views.ts` and `src/lib/portfolio/serialize.ts`

**User impact**
- Potential client-side security exposure and reliability risk (including malicious or pathological code paths).

**Suggested fix**
- Preferred: stop executing arbitrary generated JS; move to a declarative chart spec schema and render with trusted components.
- If dynamic code remains temporarily:
  - enforce strict static AST validation (not regex),
  - require bounded execution patterns,
  - add server-side sanitization + signature checks,
  - and keep strong fallback/kill-switch logic.

---

### 6) UI can freeze from expensive generated logic (medium reliability)
**What happens**
- `new Function` code runs on main thread with no execution budget.
- A generated component can do heavy loops/transforms in render and block dashboard interactivity.

**Where**
- `src/lib/portfolio/component-renderer.ts`
- `src/app/dashboard/components/dynamic-view-wrapper.tsx`

**User impact**
- Stuttering/freezing on the assets page, especially for large portfolios.

**Suggested fix**
- Replace executable-code approach with declarative specs.
- At minimum, add hard limits on input sizes to generated views, precompute heavy transformations server-side, and reject code containing obvious unbounded loop constructs.

---

### 7) Invalid nested interactive elements in AI tab strip (medium accessibility/behavior)
**What happens**
- A close `<button>` is nested inside another tab `<button>`.
- This is invalid HTML and can cause unpredictable click/focus behavior for keyboard/screen-reader users.

**Where**
- `src/app/dashboard/components/portfolio-view.tsx` (dynamic AI subtab rendering)

**User impact**
- Accessibility regression and occasional mis-click interaction.

**Suggested fix**
- Use non-button parent element (e.g., `div` with role/tab semantics) or split tab trigger and close control as sibling interactive elements.

---

### 8) `provider` toggle implies generation source control, but only filters display (medium UX)
**What happens**
- Toggle lets user pick Gemini/Sonnet in UI, but generation request always runs both providers.
- This mismatch can violate user expectation (latency/cost/behavior).

**Where**
- `src/app/dashboard/components/ai-suggestions-panel.tsx`
- `src/app/api/portfolio/ai-views/generate/route.ts`

**User impact**
- Confusing control semantics; users cannot choose faster/simpler single-provider run.

**Suggested fix**
- Either:
  - rename toggle to "View results from", or
  - wire selected provider into API and support provider-scoped generation mode.

---

### 9) Over-sharing operational details in UI copy (low)
**What happens**
- Generating progress text exposes internal model choreography ("Gemini + Sonnet ... Opus write code").

**Where**
- `src/app/dashboard/components/ai-suggestions-panel.tsx`

**User impact**
- Not a functional bug, but adds implementation noise instead of investor-focused status.

**Suggested fix**
- Replace with user-centric progress language:
  - "Analyzing your portfolio"
  - "Preparing custom views"
  - "Finalizing charts"

---

### 10) Logging includes API key prefix in server logs (low security hygiene)
**What happens**
- Gemini call logs `keyPrefix`.

**Where**
- `src/lib/llm/ai-views.ts`

**User impact**
- Small but unnecessary secret exposure in logs.

**Suggested fix**
- Remove API key prefix logging entirely.

---

## Investor-focused improvement ideas (with suggested implementation direction)

### A) Add "investor objective" context before generation
**Why**
- Investors need views aligned to goals: income, growth, drawdown control, tax efficiency, retirement runway.

**How**
- Add a lightweight selector in panel: `Income`, `Growth`, `Risk`, `Tax`, `Retirement`.
- Include selection in suggestion prompt and ranking.
- Persist objective per user in profile/settings.

### B) Add benchmark-relative perspectives
**Why**
- "Is this good?" needs baseline context (e.g., 60/40, S&P 500, custom target allocation).

**How**
- Support benchmark templates and custom target allocation.
- Generate "tracking error", "active bets", "over/underweight by sector/style" views.

### C) Add risk decomposition views (factor + concentration + correlation)
**Why**
- Investors often look diversified by ticker count but still have concentrated factor risk.

**How**
- Add built-in deterministic views:
  - concentration by top 10 holdings (HHI decomposition),
  - sector/style/factor exposures,
  - rolling correlation clusters (when price history available),
  - scenario stress view (rate shock, growth shock, equity drawdown).

### D) Time-horizon switching (short-term vs long-term)
**Why**
- Daily P/L can distract long-term investors; retirees/income investors may care about yield stability.

**How**
- Add horizon chips: `1D`, `1M`, `YTD`, `1Y`, `3Y` where data exists.
- Let suggestions depend on selected horizon (e.g., "volatility cluster in last 3 months").

### E) Tax-aware and account-location-aware analytics
**Why**
- Asset location materially affects after-tax outcomes.

**How**
- Tag account tax treatment (taxable, traditional IRA, Roth, etc.).
- Suggest views for:
  - estimated tax drag,
  - tax-loss harvesting candidates,
  - inefficient asset placement opportunities.

### F) Liability + liquidity overlays
**Why**
- Portfolio quality should be judged against liabilities and cash needs.

**How**
- Built-in "coverage" views:
  - liabilities by maturity vs liquid assets,
  - emergency liquidity runway,
  - income coverage vs spending target.

### G) Explainability and actionability layer on each view
**Why**
- Investors need "what should I do?" not just charts.

**How**
- Add an "Action Box" under each view:
  - `What this means`
  - `Potential actions`
  - `Trade-offs`
  - `Confidence level`
- Include deterministic checks so AI suggestions cannot recommend actions outside portfolio constraints.

### H) Reliability mode: deterministic fallback views first
**Why**
- When LLMs fail, investor still needs useful analytics.

**How**
- Always show a robust baseline set:
  - concentration risk,
  - diversification score breakdown,
  - account source quality/completeness.
- Append AI-generated views only when generation succeeds.

### I) Freshness and provenance indicators
**Why**
- Investors should know if numbers are stale/mixed-source.

**How**
- Show data freshness banner: latest price date, last sync per account source.
- Add provenance tags on each view ("built from live Schwab + uploaded statements", etc.).

### J) Save/share/compare workflows
**Why**
- Investors revisit decisions and compare periods.

**How**
- Save view sets as named "lenses" (e.g., "Retirement risk lens").
- Add "compare to last month" and "before/after rebalance" mode.
- Export concise PDF/PNG snapshots for advisor conversations.

## Suggested implementation order
1. Unify portfolio data source for UI + AI generation (fixes correctness first).
2. Remove/replace arbitrary code execution path with declarative chart specs.
3. Improve failure UX and generation locking.
4. Add deterministic investor-centric built-in views (risk/benchmark/tax/liquidity).
5. Add objective-based personalization and saved lenses.
