/**
 * Prompt templates for AI-suggested portfolio views.
 * Three prompts:
 * 1. Suggestion prompt — asks Gemini/Sonnet for 3 view suggestions
 * 2. Code generation prompt — asks Opus to generate React component code
 * 3. Correlation prompt — asks Gemini for cross-asset correlation analysis
 */

// ─── 1. View Suggestion Prompt ──────────────────────────────────────────────

export function buildSuggestionPrompt(portfolioSummary: string): string {
  return `You are a portfolio analysis assistant. Given the following portfolio data, suggest exactly 3 data visualizations that would provide the most valuable insights to this investor.

For each suggestion, provide:
1. title: A short name for the view (max 5 words, e.g., "Sector Concentration Risk")
2. description: 1-2 sentences explaining what the view shows and why it matters
3. chart_type: One of: "bar", "line", "scatter", "heatmap", "radar", "pie", "treemap", "composed" (bar+line overlay)
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

// ─── 2. Code Generation Prompt ──────────────────────────────────────────────

export function buildCodeGenerationPrompt(
  suggestion: { title: string; description: string; chartType: string; dataSpec: string; insight: string },
  portfolioSummary: string,
  correlationData?: string
): string {
  const correlationSection = correlationData
    ? `\n\nCorrelation analysis data (available as props.correlationData):\n${correlationData}`
    : "";

  return `You are a React/TypeScript code generator for a financial portfolio dashboard. Generate the BODY of a React functional component that renders a chart visualization.

CRITICAL CONSTRAINTS — you MUST follow these exactly:
- You are writing the BODY of a function that receives these variables in scope:
  - portfolioData: object with { positions: array, accounts: array, aggregatePositions: array, aggregateAccounts: array }
  - classifiedPortfolio: object with { totalMarketValue, totalDayChange, assetClasses: array of { def: { label, color }, marketValue, dayChange, allocationPct, holdingCount, positions: array of { symbol, description, marketValue, allocationPct, instrumentType, currentDayProfitLoss } } }
  - hideValues: boolean (when true, replace dollar amounts with "***")
  - correlationData: object or null (only for correlation views)
- Available in scope: React, useState, useMemo, and ALL recharts components:
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter, RadarChart, Radar,
  PieChart, Pie, Cell, Treemap, ResponsiveContainer, Tooltip, Legend,
  XAxis, YAxis, CartesianGrid, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Area, AreaChart, ComposedChart, ReferenceLine, Label
- Use these hex colors: #6366f1 (indigo), #8b5cf6 (violet), #06b6d4 (cyan), #f59e0b (amber), #eab308 (yellow), #10b981 (emerald), #ef4444 (red), #64748b (slate), #ec4899 (pink), #3b82f6 (blue)
- Use Tailwind CSS 4 classes for layout and text styling
- When hideValues is true, display "***" instead of dollar amounts
- Do NOT use import statements — everything is already in scope
- Do NOT use export statements
- Do NOT use markdown fences
- The code must end with a return statement that returns JSX
- The component must be self-contained — all data transformation happens inside
- Format dollar values with toLocaleString("en-US")
- Include a title heading and brief description above the chart
- Make charts responsive using ResponsiveContainer with width="100%" and a fixed height

EXAMPLE of valid output format:
const data = useMemo(() => {
  return classifiedPortfolio.assetClasses
    .filter(ac => ac.holdingCount > 0)
    .map(ac => ({ name: ac.def.label, value: ac.marketValue }));
}, [classifiedPortfolio]);

return (
  <div className="space-y-4">
    <div>
      <h3 className="text-lg font-semibold text-gray-900">Chart Title</h3>
      <p className="text-sm text-gray-500">Description here</p>
    </div>
    <div className="rounded-lg border bg-white p-4">
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="value" fill="#6366f1" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

NOW GENERATE CODE FOR THIS VIEW:
Title: ${suggestion.title}
Description: ${suggestion.description}
Chart type: ${suggestion.chartType}
Data specification: ${suggestion.dataSpec}
Insight: ${suggestion.insight}
${correlationSection}

Portfolio context (the data your component will receive):
${portfolioSummary}

Respond with ONLY the function body code. No imports, no exports, no markdown fences.`;
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
