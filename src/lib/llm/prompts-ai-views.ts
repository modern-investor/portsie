/**
 * Prompt templates for AI-suggested portfolio views.
 * Three prompts:
 * 1. Suggestion prompt — asks Gemini/Sonnet for 3 view suggestions
 * 2. Chart spec prompt — asks for a declarative JSON chart specification
 * 3. Correlation prompt — asks Gemini for cross-asset correlation analysis
 */

// ─── 1. View Suggestion Prompt ──────────────────────────────────────────────

export function buildSuggestionPrompt(portfolioSummary: string): string {
  return `You are a portfolio analysis assistant. Given the following portfolio data, suggest exactly 3 data visualizations that would provide the most valuable insights to this investor.

For each suggestion, provide:
1. title: A short name for the view (max 5 words, e.g., "Sector Concentration Risk")
2. description: 1-2 sentences explaining what the view shows and why it matters
3. chart_type: One of: "bar", "horizontal_bar", "line", "scatter", "heatmap", "radar", "pie", "treemap", "area", "composed" (bar+line overlay)
4. insight: What specific actionable insight this view reveals about the portfolio
5. data_spec: Detailed description of what data to plot — which positions/values go on each axis or dimension, how to group/aggregate, what calculations to perform from the raw portfolio data

Consider these analytical dimensions:
- Risk concentration (single stock, single sector, correlated assets)
- Asset allocation vs typical benchmark distributions
- Income generation potential (dividends, interest-bearing assets)
- Growth vs value tilt across holdings
- Geographic/sector diversification gaps
- Options exposure relative to underlying equity positions
- Cash drag or over-allocation to cash
- Liability coverage ratios (if liabilities present)
- Position sizing (top-heavy vs evenly distributed)

IMPORTANT: Each suggestion should reveal a DIFFERENT aspect of the portfolio. Do not repeat similar analyses.

Respond with JSON only — no markdown fences, no explanation:
{
  "suggestions": [
    {
      "title": "...",
      "description": "...",
      "chart_type": "...",
      "insight": "...",
      "data_spec": "..."
    },
    {
      "title": "...",
      "description": "...",
      "chart_type": "...",
      "insight": "...",
      "data_spec": "..."
    },
    {
      "title": "...",
      "description": "...",
      "chart_type": "...",
      "insight": "...",
      "data_spec": "..."
    }
  ]
}

Portfolio data:
${portfolioSummary}`;
}

// ─── 2. Chart Spec Prompt (replaces code generation) ────────────────────────

export function buildChartSpecPrompt(
  suggestion: { title: string; description: string; chartType: string; dataSpec: string; insight: string },
  portfolioSummary: string,
  correlationData?: string
): string {
  const correlationSection = correlationData
    ? `\n\nCorrelation analysis data (available via "correlationMatrix", "riskClusters", "notablePairs" sources):\n${correlationData}`
    : "";

  return `You are a chart specification generator for a financial portfolio dashboard. Generate a JSON chart specification that will be rendered by a trusted chart engine.

AVAILABLE DATA SOURCES (use one as "source" in data_transform):
- "assetClasses" — rows with: name, id, color, marketValue, dayChange, allocationPct, holdingCount
- "positions" — rows with: symbol, description, assetType, quantity, marketValue, averagePrice, dayPL, dayPLPct, accountName, source, allocationPct
- "accounts" — rows with: name, institution, type, source, cashBalance, liquidationValue, holdingsCount, isAggregate, accountCategory
- "correlationMatrix" — rows with: x (symbol), y (symbol), value (correlation -1 to 1), xIndex, yIndex
- "riskClusters" — rows with: name, symbols (comma-separated), symbolCount, internalCorrelation
- "notablePairs" — rows with: pair, correlation, reason, type (most_correlated/least_correlated)

CHART TYPES: "bar", "horizontal_bar", "line", "pie", "scatter", "radar", "treemap", "area", "composed", "heatmap"

VALUE FORMATS: "currency" (adds $), "percent" (adds %), "number" (plain)

SCHEMA:
{
  "chart_type": "<type>",
  "title": "<chart title>",
  "subtitle": "<optional description>",
  "insight": "<actionable insight>",
  "data_transform": {
    "source": "<data source>",
    "filter": { "field": "<name>", "op": "gt|lt|gte|lte|eq|neq", "value": <val> },
    "map": { "<outputKey>": "<sourceField>", ... },
    "sort": { "field": "<outputKey>", "direction": "asc|desc" },
    "limit": <number>,
    "group_by": "<field to group by>",
    "aggregate": "sum|count|avg"
  },
  "config": {
    "xKey": "<x axis key>",
    "yKeys": ["<y axis key(s)>"],
    "colors": ["#hex1", "#hex2", ...],
    "showLegend": true/false,
    "showGrid": true/false,
    "height": <px>,
    "valueFormat": "currency|percent|number",
    "referenceLines": [{ "axis": "y", "value": <num>, "label": "<text>", "color": "#hex" }],
    "innerRadius": <for donut charts>,
    "radarAxes": ["<axis keys>"],
    "labels": { "<key>": "<display label>", ... },
    "barKeys": ["<for composed charts>"],
    "lineKeys": ["<for composed charts>"],
    "heatmapXLabels": ["<labels>"],
    "heatmapYLabels": ["<labels>"]
  }
}

EXAMPLES:

Example 1 — Bar chart of asset classes by value:
{
  "chart_type": "bar",
  "title": "Asset Allocation by Value",
  "subtitle": "Market value distribution across asset classes",
  "insight": "Technology equities dominate at 65% of portfolio",
  "data_transform": {
    "source": "assetClasses",
    "filter": { "field": "holdingCount", "op": "gt", "value": 0 },
    "map": { "name": "name", "value": "marketValue", "color": "color" },
    "sort": { "field": "value", "direction": "desc" }
  },
  "config": {
    "xKey": "name",
    "yKeys": ["value"],
    "valueFormat": "currency",
    "showGrid": true,
    "height": 400
  }
}

Example 2 — Horizontal bar of top 10 positions:
{
  "chart_type": "horizontal_bar",
  "title": "Top 10 Holdings",
  "subtitle": "Largest positions by market value",
  "insight": "Top 3 holdings represent 45% of portfolio",
  "data_transform": {
    "source": "positions",
    "map": { "name": "symbol", "value": "marketValue" },
    "sort": { "field": "value", "direction": "desc" },
    "limit": 10
  },
  "config": {
    "xKey": "name",
    "yKeys": ["value"],
    "valueFormat": "currency",
    "height": 400
  }
}

NOW GENERATE A CHART SPEC FOR THIS VIEW:
Title: ${suggestion.title}
Description: ${suggestion.description}
Chart type: ${suggestion.chartType}
Data specification: ${suggestion.dataSpec}
Insight: ${suggestion.insight}
${correlationSection}

Portfolio context:
${portfolioSummary}

Respond with JSON only — no markdown fences, no explanation.`;
}

// ─── 3. Correlation Analysis Prompt ─────────────────────────────────────────

export function buildCorrelationPrompt(portfolioSummary: string): string {
  return `You are a portfolio correlation analysis engine. Analyze the following portfolio positions and compute cross-asset correlations.

For the analysis, focus on the top 15 positions by market value. Use your knowledge of historical price correlations between these assets and asset classes.

Compute the following:

1. correlation_matrix: An NxN matrix of estimated correlation coefficients (-1.0 to +1.0) between the top positions. The diagonal should be 1.0. Values should reflect realistic historical correlations (e.g., AAPL and MSFT ~0.7, GLD and SPY ~0.05, etc.)

2. diversity_score: A single integer from 1 to 100 where:
   - 1 = all assets are perfectly correlated (e.g., TSLA stock + TSLA LEAPs + TSLA calls = extremely low)
   - 100 = extremely diversified across uncorrelated asset classes

   Scoring guidelines:
   - Same underlying + its derivatives: 5-15
   - All same-sector stocks: 15-25
   - Same asset class, different sectors: 25-40
   - Mix of 2-3 asset classes: 40-55
   - Broad mix of stocks, bonds, commodities: 55-70
   - Stocks + gold + real estate + international + fixed income: 70-85
   - Truly uncorrelated alternatives + global diversification: 85-100

3. notable_pairs: The 5 most correlated and 5 least correlated position pairs with their estimated correlation coefficient and a brief reason.

4. risk_clusters: Groups of positions that tend to move together. Each cluster should have a name, list of symbols, and estimated internal correlation.

5. analysis_summary: A 2-3 sentence summary of the portfolio's overall correlation characteristics and diversification quality.

Respond with JSON only — no markdown fences:
{
  "symbols": ["AAPL", "TSLA", ...],
  "correlation_matrix": [[1.0, 0.65, ...], [0.65, 1.0, ...], ...],
  "diversity_score": 42,
  "notable_pairs": {
    "most_correlated": [
      {"pair": ["SYM1", "SYM2"], "correlation": 0.95, "reason": "Same underlying"}
    ],
    "least_correlated": [
      {"pair": ["GLD", "QQQ"], "correlation": 0.05, "reason": "Different asset classes"}
    ]
  },
  "risk_clusters": [
    {"name": "Tech Growth", "symbols": ["AAPL", "MSFT", "NVDA"], "internal_correlation": 0.72}
  ],
  "analysis_summary": "..."
}

Portfolio positions:
${portfolioSummary}`;
}
