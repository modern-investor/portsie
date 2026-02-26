"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { UploadedStatement } from "@/lib/upload/types";
import type { PortsieExtraction } from "@/lib/extraction/schema";
import type { ProcessingPreset } from "@/lib/llm/types";
import { PRESET_LABELS } from "./processing-preset-select";
import { UploadReview } from "./upload-review";

const STATUS_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  pending: { label: "Pending", className: "bg-gray-100 text-gray-600" },
  queued: { label: "Queued", className: "bg-yellow-100 text-yellow-700" },
  processing: {
    label: "Processing",
    className: "bg-blue-100 text-blue-700",
  },
  extracted: { label: "Extracted", className: "bg-green-100 text-green-700" },
  completed: { label: "Saved", className: "bg-green-100 text-green-700" },
  partial: {
    label: "Partial extraction",
    className: "bg-amber-100 text-amber-700",
  },
  failed: { label: "Failed", className: "bg-red-100 text-red-700" },
  qc_running: { label: "Verifying...", className: "bg-purple-100 text-purple-700" },
  qc_failed: { label: "Quality issue", className: "bg-orange-100 text-orange-700" },
  qc_fixing: { label: "Auto-fixing...", className: "bg-purple-100 text-purple-700" },
};

const FILE_TYPE_ICONS: Record<string, string> = {
  pdf: "PDF",
  csv: "CSV",
  xlsx: "XLS",
  png: "IMG",
  jpg: "IMG",
  ofx: "OFX",
  qfx: "QFX",
  txt: "TXT",
  json: "JSON",
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Format as DD-Mon-YY, e.g. 01-Jan-25 */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = SHORT_MONTHS[d.getUTCMonth()];
  const yr = String(d.getUTCFullYear()).slice(-2);
  return `${day}-${mon}-${yr}`;
}

function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  if (start && end) {
    if (start === end) return formatDate(start);
    return `${formatDate(start)} to ${formatDate(end)}`;
  }
  return formatDate(start || end!);
}

/** Format an ISO timestamp as h:mm:ssa, e.g. 2:05:30p */
function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ampm = h >= 12 ? "p" : "a";
  h = h % 12 || 12;
  return `${h}:${m}:${s}${ampm}`;
}

/** Describe what kind of data was extracted (compact) */
function describeContent(upload: UploadedStatement): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = upload.extracted_data as any;
  if (!data) return null;
  const parts: string[] = [];
  // Support both PortsieExtraction (accounts[].transactions) and legacy flat arrays
  if (data.accounts && Array.isArray(data.accounts)) {
    const trans = data.accounts.reduce((s: number, a: { transactions?: unknown[] }) => s + (a.transactions?.length ?? 0), 0);
    const pos = data.accounts.reduce((s: number, a: { positions?: unknown[] }) => s + (a.positions?.length ?? 0), 0) + (data.unallocated_positions?.length ?? 0);
    const bal = data.accounts.reduce((s: number, a: { balances?: unknown[] }) => s + (a.balances?.length ?? 0), 0);
    if (trans > 0) parts.push(`${trans} trans`);
    if (pos > 0) parts.push(`${pos} pos`);
    if (bal > 0) parts.push(`${bal} bal`);
  } else {
    if (data.transactions?.length > 0) parts.push(`${data.transactions.length} trans`);
    if (data.positions?.length > 0) parts.push(`${data.positions.length} pos`);
    if (data.balances?.length > 0) parts.push(`${data.balances.length} bal`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Spinner icon for active processing */
function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 16 16"
      fill="none"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity="0.25"
      />
      <path
        d="M14 8a6 6 0 00-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Live elapsed timer that ticks every second */
function ElapsedTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - new Date(since).getTime()) / 1000)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(since).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [since]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const display = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return <span className="tabular-nums">{display}</span>;
}

/** Static elapsed time between two timestamps (no ticking) */
function StaticElapsed({ start, end }: { start: string; end: string }) {
  const secs = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  const display = mins > 0 ? `${mins}m ${rem}s` : `${rem}s`;
  return <span className="tabular-nums">{display}</span>;
}

/** Compact inline summary shown below a completed upload row */
function InlineSummary({ upload }: { upload: UploadedStatement }) {
  const ext = upload.extracted_data as PortsieExtraction | null;
  if (!ext) return null;

  const totalPositions = ext.accounts.reduce((s, a) => s + a.positions.length, 0) + ext.unallocated_positions.length;
  const totalTransactions = ext.accounts.reduce((s, a) => s + a.transactions.length, 0);
  const totalBalances = ext.accounts.reduce((s, a) => s + a.balances.length, 0);

  // Get total value from first account's first balance
  const totalValue = ext.accounts.reduce((sum, a) => {
    const bal = a.balances[0];
    return sum + (bal?.liquidation_value ?? 0);
  }, 0);

  const institutions = [...new Set(ext.accounts.map((a) => a.account_info.institution_name).filter(Boolean))];
  const MAX_INSTITUTIONS = 3;
  const displayInstitutions = institutions.slice(0, MAX_INSTITUTIONS);
  const extraCount = institutions.length - MAX_INSTITUTIONS;

  return (
    <div className="ml-[52px] sm:ml-[56px] -mt-1 mb-1 flex flex-wrap items-center gap-1.5 text-xs">
      {displayInstitutions.length > 0 && (
        <span className="font-medium text-gray-600">
          {displayInstitutions.join(", ")}
          {extraCount > 0 && ` +${extraCount} more`}
        </span>
      )}
      {totalValue > 0 && (
        <span className="rounded bg-green-50 px-1.5 py-0.5 font-medium text-green-700">
          ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )}
      {totalPositions > 0 && (
        <span className="rounded bg-purple-50 px-1.5 py-0.5 text-purple-600">
          {totalPositions} pos
        </span>
      )}
      {totalTransactions > 0 && (
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">
          {totalTransactions} txn
        </span>
      )}
      {totalBalances > 0 && (
        <span className="rounded bg-teal-50 px-1.5 py-0.5 text-teal-600">
          {totalBalances} bal
        </span>
      )}
      {upload.verification_data && !upload.verification_error && (
        <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-600">
          verified
        </span>
      )}
      {upload.verification_error && (
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-600" title={upload.verification_error}>
          verify failed
        </span>
      )}
    </div>
  );
}

type ProcessingItem =
  | { type: "quote"; text: string; author: string }
  | { type: "fact"; text: string; category: string };

const PROCESSING_ITEMS: ProcessingItem[] = [
  // ── Quotes (54) ─────────────────────────────────────────────────────
  { type: "quote", text: "The stock market is a device for transferring money from the impatient to the patient.", author: "Warren Buffett" },
  { type: "quote", text: "In investing, what is comfortable is rarely profitable.", author: "Robert Arnott" },
  { type: "quote", text: "The individual investor should act consistently as an investor and not as a speculator.", author: "Ben Graham" },
  { type: "quote", text: "The biggest risk of all is not taking one.", author: "Mellody Hobson" },
  { type: "quote", text: "It's not whether you're right or wrong, but how much money you make when you're right and how much you lose when you're wrong.", author: "George Soros" },
  { type: "quote", text: "Know what you own, and know why you own it.", author: "Peter Lynch" },
  { type: "quote", text: "The four most dangerous words in investing are: 'This time it's different.'", author: "Sir John Templeton" },
  { type: "quote", text: "Wide diversification is only required when investors do not understand what they are doing.", author: "Warren Buffett" },
  { type: "quote", text: "The desire to perform all the time is usually a barrier to performing over time.", author: "Robert Olstein" },
  { type: "quote", text: "If you aren't willing to own a stock for 10 years, don't even think about owning it for 10 minutes.", author: "Warren Buffett" },
  { type: "quote", text: "Investing should be more like watching paint dry or watching grass grow. If you want excitement, take $800 and go to Las Vegas.", author: "Paul Samuelson" },
  { type: "quote", text: "The intelligent investor is a realist who sells to optimists and buys from pessimists.", author: "Ben Graham" },
  { type: "quote", text: "Behind every stock is a company. Find out what it's doing.", author: "Peter Lynch" },
  { type: "quote", text: "Someone's sitting in the shade today because someone planted a tree a long time ago.", author: "Warren Buffett" },
  { type: "quote", text: "Bull markets are born on pessimism, grow on skepticism, mature on optimism, and die on euphoria.", author: "Sir John Templeton" },
  { type: "quote", text: "The market is a pendulum that forever swings between unsustainable optimism and unjustified pessimism.", author: "Ben Graham" },
  { type: "quote", text: "Spend each day trying to be a little wiser than you were when you woke up.", author: "Charlie Munger" },
  { type: "quote", text: "All intelligent investing is value investing — acquiring more than you are paying for.", author: "Charlie Munger" },
  { type: "quote", text: "Risk comes from not knowing what you're doing.", author: "Warren Buffett" },
  { type: "quote", text: "October: This is one of the peculiarly dangerous months to speculate in stocks. The others are July, January, September, April, November, May, March, June, December, August, and February.", author: "Mark Twain" },
  { type: "quote", text: "Compound interest is the eighth wonder of the world. He who understands it, earns it; he who doesn't, pays it.", author: "Albert Einstein (attributed)" },
  { type: "quote", text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
  { type: "quote", text: "The stock market is filled with individuals who know the price of everything, but the value of nothing.", author: "Philip Fisher" },
  { type: "quote", text: "Go to bed a little smarter each day.", author: "Charlie Munger" },
  { type: "quote", text: "I will tell you how to become rich. Close the doors. Be fearful when others are greedy. Be greedy when others are fearful.", author: "Warren Buffett" },
  { type: "quote", text: "Returns matter a lot. It's our money.", author: "Bill Ackman" },
  { type: "quote", text: "Time in the market beats timing the market.", author: "Ken Fisher" },
  { type: "quote", text: "The only value of stock forecasters is to make fortune-tellers look good.", author: "Warren Buffett" },
  { type: "quote", text: "Price is what you pay. Value is what you get.", author: "Warren Buffett" },
  { type: "quote", text: "The market can stay irrational longer than you can stay solvent.", author: "John Maynard Keynes" },
  { type: "quote", text: "In the short run, the market is a voting machine, but in the long run, it is a weighing machine.", author: "Ben Graham" },
  { type: "quote", text: "Far more money has been lost by investors preparing for corrections than has been lost in the corrections themselves.", author: "Peter Lynch" },
  { type: "quote", text: "Never invest in a business you cannot understand.", author: "Warren Buffett" },
  { type: "quote", text: "You get recessions, you have stock market declines. If you don't understand that's going to happen, then you're not ready.", author: "Peter Lynch" },
  { type: "quote", text: "We don't have to be smarter than the rest. We have to be more disciplined than the rest.", author: "Warren Buffett" },
  { type: "quote", text: "The secret to investing is to figure out the value of something — and then pay a lot less.", author: "Joel Greenblatt" },
  { type: "quote", text: "You only find out who is swimming naked when the tide goes out.", author: "Warren Buffett" },
  { type: "quote", text: "The most important quality for an investor is temperament, not intellect.", author: "Warren Buffett" },
  { type: "quote", text: "Buy when there's blood in the streets, even if the blood is your own.", author: "Baron Rothschild" },
  { type: "quote", text: "Invert, always invert. Turn a situation or problem upside down. Look at it backward.", author: "Charlie Munger" },
  { type: "quote", text: "Rule No. 1: Never lose money. Rule No. 2: Never forget Rule No. 1.", author: "Warren Buffett" },
  { type: "quote", text: "Markets are constantly in a state of uncertainty and flux. Money is made by discounting the obvious and betting on the unexpected.", author: "George Soros" },
  { type: "quote", text: "Wall Street makes its money on activity. You make your money on inactivity.", author: "Warren Buffett" },
  { type: "quote", text: "The most important thing about an investment philosophy is that you have one.", author: "David Booth" },
  { type: "quote", text: "If past history was all there was to the game, the richest people would be librarians.", author: "Warren Buffett" },
  { type: "quote", text: "The best time to plant a tree was twenty years ago. The second best time is now.", author: "Chinese Proverb" },
  { type: "quote", text: "Successful investing is about managing risk, not avoiding it.", author: "Ben Graham" },
  { type: "quote", text: "It takes 20 years to build a reputation and five minutes to ruin it.", author: "Warren Buffett" },
  { type: "quote", text: "The key to making money in stocks is not to get scared out of them.", author: "Peter Lynch" },
  { type: "quote", text: "Good investing is not necessarily about making good decisions. It's about consistently not screwing up.", author: "Morgan Housel" },
  { type: "quote", text: "Money is a terrible master but an excellent servant.", author: "P.T. Barnum" },
  { type: "quote", text: "I'd be a bum on the street with a tin cup if the markets were always efficient.", author: "Warren Buffett" },
  { type: "quote", text: "Diversification is protection against ignorance. It makes little sense if you know what you are doing.", author: "Warren Buffett" },
  { type: "quote", text: "Investing isn't about beating others at their game. It's about controlling yourself at your own game.", author: "Ben Graham" },
  // ── Educational Facts (54) ──────────────────────────────────────────
  { type: "fact", text: "The S&P 500 has delivered positive returns in roughly 73% of all calendar years since 1928.", category: "Market History" },
  { type: "fact", text: "Missing just the 10 best trading days over a 20-year period can cut your total return by more than half.", category: "Market History" },
  { type: "fact", text: "Since 1950, the average bear market has lasted 13 months. The average bull market? 67 months.", category: "Market History" },
  { type: "fact", text: "The Dow Jones was 66 points in 1900. It took 72 years to first reach 1,000.", category: "Market History" },
  { type: "fact", text: "From 1926 to 2024, small-cap value stocks outperformed large-cap growth by roughly 3% per year.", category: "Market History" },
  { type: "fact", text: "The 'January effect' — small caps outperforming in January — has largely disappeared since it was first published in 1976.", category: "Market History" },
  { type: "fact", text: "In 1987, the Dow fell 22.6% in a single day — Black Monday. It recovered to pre-crash levels within two years.", category: "Market History" },
  { type: "fact", text: "US equities have delivered a real (inflation-adjusted) return of about 6.4% per year since 1900.", category: "Market History" },
  { type: "fact", text: "The longest US bull market ran from March 2009 to February 2020 — nearly 11 years.", category: "Market History" },
  { type: "fact", text: "Adding uncorrelated assets to a portfolio can reduce volatility without reducing expected return — the only 'free lunch' in finance.", category: "Portfolio Theory" },
  { type: "fact", text: "A 60/40 stock/bond portfolio has historically captured ~90% of equity returns with ~60% of the volatility.", category: "Portfolio Theory" },
  { type: "fact", text: "Rebalancing a diversified portfolio annually has historically added 0.5–1% in returns versus a never-rebalanced portfolio.", category: "Portfolio Theory" },
  { type: "fact", text: "Beyond about 30 stocks, additional diversification reduces portfolio-specific risk only marginally.", category: "Portfolio Theory" },
  { type: "fact", text: "The Sharpe ratio was developed by William Sharpe in 1966 and remains the most widely used risk-adjusted performance metric.", category: "Portfolio Theory" },
  { type: "fact", text: "Low-volatility stocks have historically outperformed high-volatility stocks on a risk-adjusted basis — the 'low-vol anomaly.'", category: "Portfolio Theory" },
  { type: "fact", text: "Currency hedging in international equity portfolios has minimal impact on long-term returns but significantly reduces short-term volatility.", category: "Portfolio Theory" },
  { type: "fact", text: "Investors typically feel losses 2–2.5x more intensely than equivalent gains — a phenomenon called loss aversion.", category: "Behavioral Finance" },
  { type: "fact", text: "The disposition effect — selling winners too early and holding losers too long — is one of the most documented investor biases.", category: "Behavioral Finance" },
  { type: "fact", text: "Studies show that investors who check their portfolios daily earn significantly less than those who check quarterly or annually.", category: "Behavioral Finance" },
  { type: "fact", text: "Overconfidence leads the average active trader to underperform the market by 2–4% annually after transaction costs.", category: "Behavioral Finance" },
  { type: "fact", text: "Anchoring: investors fixate on their purchase price as a reference point, even though the market doesn't know or care what you paid.", category: "Behavioral Finance" },
  { type: "fact", text: "The endowment effect causes investors to value assets they own 2–3x more than identical assets they don't own.", category: "Behavioral Finance" },
  { type: "fact", text: "Herding intensifies during crashes — forced selling begets more selling, often driving prices well below fundamental value.", category: "Behavioral Finance" },
  { type: "fact", text: "Recency bias leads investors to overweight recent performance. Top-performing funds rarely repeat in the following period.", category: "Behavioral Finance" },
  { type: "fact", text: "US Treasury bonds have never defaulted in over 230 years, making them the global benchmark for 'risk-free' assets.", category: "Asset Classes" },
  { type: "fact", text: "Gold has maintained purchasing power for millennia — an ounce bought a fine toga in ancient Rome and buys a fine suit today.", category: "Asset Classes" },
  { type: "fact", text: "REITs have outperformed the S&P 500 over several multi-decade periods with only 0.6 correlation to equities.", category: "Asset Classes" },
  { type: "fact", text: "High-yield bonds were essentially invented by Michael Milken in the 1980s and are now a $1.5 trillion market.", category: "Asset Classes" },
  { type: "fact", text: "Commodities have near-zero long-term real returns but serve as effective inflation hedges during supply shocks.", category: "Asset Classes" },
  { type: "fact", text: "Private equity looks ~3% better than public markets, but much of that premium disappears after adjusting for leverage and illiquidity.", category: "Asset Classes" },
  { type: "fact", text: "TIPS guarantee a real return above inflation — but that real yield has sometimes been negative.", category: "Asset Classes" },
  { type: "fact", text: "The average hedge fund has underperformed a simple 60/40 portfolio since 2009, net of fees.", category: "Asset Classes" },
  { type: "fact", text: "Volatility clusters: large daily moves tend to be followed by more large moves — the basis of GARCH models used across Wall Street.", category: "Risk & Return" },
  { type: "fact", text: "The S&P 500 has experienced a drawdown of 10% or more in roughly half of all calendar years since 1928.", category: "Risk & Return" },
  { type: "fact", text: "Historically, buying the S&P 500 when the VIX is above 30 has produced above-average 12-month forward returns.", category: "Risk & Return" },
  { type: "fact", text: "A 50% portfolio loss requires a 100% gain just to break even — which is why drawdown management matters more than chasing returns.", category: "Risk & Return" },
  { type: "fact", text: "The equity risk premium — the excess return of stocks over bonds — has averaged about 4–5% globally since 1900.", category: "Risk & Return" },
  { type: "fact", text: "Roughly 40% of the S&P 500's total return since 1928 came from just the 10 best days in each decade.", category: "Risk & Return" },
  { type: "fact", text: "The Sortino ratio improves on the Sharpe by penalizing only downside volatility — more relevant for loss-averse investors.", category: "Risk & Return" },
  { type: "fact", text: "Japan's Nikkei 225 peaked at 38,957 in December 1989 and took over 34 years to surpass that level.", category: "Global Markets" },
  { type: "fact", text: "Emerging markets represent over 40% of global GDP but only about 12% of global equity market capitalization.", category: "Global Markets" },
  { type: "fact", text: "The US stock market's share of global market cap grew from about 30% in 1990 to over 60% by 2024.", category: "Global Markets" },
  { type: "fact", text: "Currency movements can add or subtract 5–10% per year from international equity returns for unhedged investors.", category: "Global Markets" },
  { type: "fact", text: "China's stock market has returned under 2% annually in real terms since 2007, despite GDP growth averaging above 6%.", category: "Global Markets" },
  { type: "fact", text: "The 'home bias' — investors overweighting domestic stocks — is one of the most persistent inefficiencies in global markets.", category: "Global Markets" },
  { type: "fact", text: "$1 invested in the S&P 500 in 1926 would be worth over $13,000 today — the compounding effect of ~10% annual returns.", category: "Economics" },
  { type: "fact", text: "The Fed has raised rates in 14 tightening cycles since 1955. Equities were positive during 12 of the 14.", category: "Economics" },
  { type: "fact", text: "Inflation above 4% correlates with higher equity volatility and lower P/E multiples across developed markets.", category: "Economics" },
  { type: "fact", text: "Corporate buybacks have exceeded dividends as the primary method of returning cash to shareholders since the mid-2000s.", category: "Economics" },
  { type: "fact", text: "The average US equity fund expense ratio fell from 1.0% in 2000 to under 0.4% by 2024 — a massive long-term tailwind.", category: "Economics" },
  { type: "fact", text: "Tax-loss harvesting can add 0.5–1.5% in after-tax returns annually for taxable accounts.", category: "Economics" },
  { type: "fact", text: "About 40% of stocks in the Russell 3000 have experienced a decline of 70%+ from their peak at some point.", category: "Economics" },
  { type: "fact", text: "The '4% rule' for retirement withdrawals was derived from data showing balanced portfolios survived 30-year periods at that rate.", category: "Economics" },
  { type: "fact", text: "Between 1900 and 2024, equities outperformed bonds, bills, and inflation in every major economy studied — the equity premium is universal.", category: "Global Markets" },
];

/** Consistent avatar colors keyed by author name */
const AUTHOR_STYLES: Record<string, { bg: string; text: string; accent: string }> = {
  "Warren Buffett":               { bg: "bg-amber-100",   text: "text-amber-700",   accent: "from-amber-50" },
  "Robert Arnott":                { bg: "bg-blue-100",    text: "text-blue-700",    accent: "from-blue-50" },
  "Ben Graham":                   { bg: "bg-emerald-100", text: "text-emerald-700", accent: "from-emerald-50" },
  "Mellody Hobson":               { bg: "bg-purple-100",  text: "text-purple-700",  accent: "from-purple-50" },
  "George Soros":                 { bg: "bg-slate-200",   text: "text-slate-700",   accent: "from-slate-50" },
  "Peter Lynch":                  { bg: "bg-teal-100",    text: "text-teal-700",    accent: "from-teal-50" },
  "Sir John Templeton":           { bg: "bg-indigo-100",  text: "text-indigo-700",  accent: "from-indigo-50" },
  "Robert Olstein":               { bg: "bg-cyan-100",    text: "text-cyan-700",    accent: "from-cyan-50" },
  "Paul Samuelson":               { bg: "bg-rose-100",    text: "text-rose-700",    accent: "from-rose-50" },
  "Charlie Munger":               { bg: "bg-orange-100",  text: "text-orange-700",  accent: "from-orange-50" },
  "Mark Twain":                   { bg: "bg-pink-100",    text: "text-pink-700",    accent: "from-pink-50" },
  "Albert Einstein (attributed)": { bg: "bg-violet-100",  text: "text-violet-700",  accent: "from-violet-50" },
  "Benjamin Franklin":            { bg: "bg-lime-100",    text: "text-lime-700",    accent: "from-lime-50" },
  "Philip Fisher":                { bg: "bg-fuchsia-100", text: "text-fuchsia-700", accent: "from-fuchsia-50" },
  "Bill Ackman":                  { bg: "bg-sky-100",     text: "text-sky-700",     accent: "from-sky-50" },
  "Ken Fisher":                   { bg: "bg-yellow-100",  text: "text-yellow-700",  accent: "from-yellow-50" },
  "John Maynard Keynes":          { bg: "bg-stone-200",   text: "text-stone-700",   accent: "from-stone-50" },
  "Joel Greenblatt":              { bg: "bg-emerald-100", text: "text-emerald-700", accent: "from-emerald-50" },
  "Baron Rothschild":             { bg: "bg-red-100",     text: "text-red-700",     accent: "from-red-50" },
  "David Booth":                  { bg: "bg-blue-100",    text: "text-blue-700",    accent: "from-blue-50" },
  "Chinese Proverb":              { bg: "bg-amber-100",   text: "text-amber-700",   accent: "from-amber-50" },
  "Morgan Housel":                { bg: "bg-teal-100",    text: "text-teal-700",    accent: "from-teal-50" },
  "P.T. Barnum":                  { bg: "bg-pink-100",    text: "text-pink-700",    accent: "from-pink-50" },
};

/** Color palette for educational fact categories */
const CATEGORY_STYLES: Record<string, { bg: string; text: string; accent: string }> = {
  "Market History":      { bg: "bg-blue-100",    text: "text-blue-600",    accent: "from-blue-50" },
  "Portfolio Theory":    { bg: "bg-emerald-100", text: "text-emerald-600", accent: "from-emerald-50" },
  "Behavioral Finance":  { bg: "bg-violet-100",  text: "text-violet-600",  accent: "from-violet-50" },
  "Asset Classes":       { bg: "bg-amber-100",   text: "text-amber-600",   accent: "from-amber-50" },
  "Risk & Return":       { bg: "bg-rose-100",    text: "text-rose-600",    accent: "from-rose-50" },
  "Global Markets":      { bg: "bg-cyan-100",    text: "text-cyan-600",    accent: "from-cyan-50" },
  "Economics":           { bg: "bg-lime-100",    text: "text-lime-600",    accent: "from-lime-50" },
};

const DEFAULT_STYLE = { bg: "bg-gray-100", text: "text-gray-600", accent: "from-gray-50" };

function getInitials(name: string) {
  return name
    .split(" ")
    .filter((w) => !w.startsWith("("))
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Small bar-chart icon for educational facts */
function FactIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M3 17V9h4v8H3zm5 0V3h4v14H8zm5 0V7h4v10h-4z" />
    </svg>
  );
}

/** Rotating investing wisdom quotes & educational facts shown during processing */
function ProcessingQuotes() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * PROCESSING_ITEMS.length));
  const [fade, setFade] = useState(true);

  const advance = useCallback(() => {
    setFade(false);
    setTimeout(() => {
      setIndex((prev) => (prev + 1) % PROCESSING_ITEMS.length);
      setFade(true);
    }, 400);
  }, []);

  useEffect(() => {
    const interval = setInterval(advance, 20_000);
    return () => clearInterval(interval);
  }, [advance]);

  const item = PROCESSING_ITEMS[index];
  const isQuote = item.type === "quote";
  const style = isQuote
    ? (AUTHOR_STYLES[(item as { author: string }).author] || DEFAULT_STYLE)
    : (CATEGORY_STYLES[(item as { category: string }).category] || DEFAULT_STYLE);
  const label = isQuote ? (item as { author: string }).author : (item as { category: string }).category;

  return (
    <div className={`relative mt-5 overflow-hidden rounded-2xl bg-gradient-to-br ${style.accent} to-white border border-gray-200/70 px-7 py-6 shadow-sm`}>
      {/* Large decorative opening quote mark (quotes only) */}
      {isQuote && (
        <svg
          className="absolute -top-1 left-3 h-20 w-20 opacity-[0.08]"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C9.591 11.69 11 13.166 11 15c0 1.933-1.567 3.5-3.5 3.5-1.171 0-2.272-.548-2.917-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C19.591 11.69 21 13.166 21 15c0 1.933-1.567 3.5-3.5 3.5-1.171 0-2.272-.548-2.917-1.179z" />
        </svg>
      )}

      <div
        className={`relative flex items-center gap-5 transition-all duration-500 ease-in-out ${fade ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}
      >
        {/* Avatar: initials for quotes, chart icon for facts */}
        <div
          className={`shrink-0 flex h-12 w-12 items-center justify-center rounded-full ${style.bg} ring-2 ring-white shadow-sm`}
        >
          {isQuote ? (
            <span className={`text-sm font-bold tracking-tight ${style.text}`}>
              {getInitials((item as { author: string }).author)}
            </span>
          ) : (
            <FactIcon className={`h-5 w-5 ${style.text}`} />
          )}
        </div>

        <div className="flex-1 min-h-[4rem]">
          <p className={`text-base leading-relaxed text-gray-700 font-medium ${isQuote ? "italic" : ""}`}>
            {isQuote ? <>&ldquo;{item.text}&rdquo;</> : item.text}
          </p>
          <p className="mt-2 text-sm font-semibold text-gray-500 tracking-wide">
            {label}
          </p>
        </div>
      </div>

      {/* Large decorative closing quote mark (quotes only) */}
      {isQuote && (
        <svg
          className="absolute -bottom-2 right-4 h-16 w-16 opacity-[0.06] rotate-180"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C9.591 11.69 11 13.166 11 15c0 1.933-1.567 3.5-3.5 3.5-1.171 0-2.272-.548-2.917-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C19.591 11.69 21 13.166 21 15c0 1.933-1.567 3.5-3.5 3.5-1.171 0-2.272-.548-2.917-1.179z" />
        </svg>
      )}
    </div>
  );
}

export function UploadList({
  uploads,
  processingIds,
  queuedIds,
  batchTotal,
  batchDone,
  timestamps,
  processCount,
  processingPreset,
  reviewingId,
  onReview,
  onDelete,
  onReprocess,
  onSaved,
  onCloseReview,
}: {
  uploads: UploadedStatement[];
  processingIds: Set<string>;
  queuedIds: Set<string>;
  batchTotal: number;
  batchDone: number;
  timestamps: Record<string, { q?: string; s?: string; e?: string }>;
  processCount: Record<string, number>;
  processingPreset: ProcessingPreset;
  reviewingId: string | null;
  onReview: (id: string) => void;
  onDelete: (id: string) => void;
  onReprocess: () => void;
  onSaved: (updated: UploadedStatement) => void;
  onCloseReview: () => void;
}) {
  // Ref for scrolling to expanded review
  const reviewRef = useRef<HTMLDivElement>(null);

  // Sort uploads in reverse chronological order
  const sortedUploads = useMemo(
    () => [...uploads].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [uploads]
  );

  // Scroll to expanded review when reviewingId changes
  useEffect(() => {
    if (reviewingId && reviewRef.current) {
      requestAnimationFrame(() => {
        reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [reviewingId]);

  if (uploads.length === 0) return null;

  const reviewingUpload = reviewingId
    ? uploads.find((u) => u.id === reviewingId) ?? null
    : null;

  return (
    <div className="space-y-2">
      {/* Batch progress bar */}
      {batchTotal > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-blue-800">
              Processing {batchDone + 1} of {batchTotal}
            </span>
            <span className="text-blue-600">
              {batchDone} done
              {batchTotal - batchDone - 1 > 0 && `, ${batchTotal - batchDone - 1} queued`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-blue-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
              style={{ width: `${(batchDone / batchTotal) * 100}%` }}
            />
          </div>
        </div>
      )}

      {sortedUploads.map((upload) => {
        const isQueued = queuedIds.has(upload.id);
        const ts = timestamps[upload.id];
        const hasEnded = !!ts?.e;
        // Only show live "Processing" spinner if THIS client session initiated it
        const isActivelyProcessing = processingIds.has(upload.id);
        const isLiveProcessing = isActivelyProcessing && !hasEnded;
        // Determine display status
        const status = isLiveProcessing
          ? STATUS_STYLES.processing
          : isQueued
            ? STATUS_STYLES.queued
            : STATUS_STYLES[upload.parse_status] ?? STATUS_STYLES.pending;
        const isConfirmed = !!upload.confirmed_at;
        const isExpanded = reviewingId === upload.id;
        const hasReview = upload.parse_status === "extracted" || upload.parse_status === "completed" || upload.parse_status === "partial" || upload.parse_status === "qc_failed";
        const isQCActive = upload.parse_status === "qc_running" || upload.parse_status === "qc_fixing";

        return (
          <div key={upload.id} id={`upload-${upload.id}`}>
            <div
              className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2.5 sm:flex-nowrap sm:gap-3 sm:px-4 sm:py-3 ${
                hasReview ? "cursor-pointer hover:border-gray-300" : ""
              } ${isExpanded ? "border-gray-400 bg-gray-50/50" : ""}`}
              onClick={hasReview ? () => onReview(isExpanded ? "" : upload.id) : undefined}
            >
              {/* File type badge */}
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-gray-100 text-xs font-semibold text-gray-500">
                {FILE_TYPE_ICONS[upload.file_type] ?? "?"}
              </span>

              {/* File info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{upload.filename}</p>
                <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-gray-400">
                  {upload.extracted_data?.accounts?.[0]?.account_info?.institution_name && (
                    <>
                      <span className="font-medium text-gray-600">
                        {upload.extracted_data.accounts[0].account_info.institution_name}
                      </span>
                      <span aria-hidden>&middot;</span>
                    </>
                  )}
                  {upload.extracted_data?.accounts?.[0]?.account_info?.account_type && (
                    <>
                      <span>{upload.extracted_data.accounts[0].account_info.account_type}</span>
                      <span aria-hidden>&middot;</span>
                    </>
                  )}
                  {(() => {
                    const range = formatDateRange(upload.statement_start_date, upload.statement_end_date);
                    return range ? (
                      <>
                        <span>{range}</span>
                        <span aria-hidden>&middot;</span>
                      </>
                    ) : null;
                  })()}
                  {(() => {
                    const content = describeContent(upload);
                    return content ? (
                      <>
                        <span>{content}</span>
                        <span aria-hidden>&middot;</span>
                      </>
                    ) : null;
                  })()}
                  <span>{formatFileSize(upload.file_size_bytes)}</span>
                  <span aria-hidden>&middot;</span>
                  <span title={upload.created_at}>
                    &#x2191;{formatDate(upload.created_at)}
                  </span>
                  {upload.parse_error && (
                    <span
                      className={`truncate ${isLiveProcessing || isQueued ? "text-gray-300 line-through" : "text-red-500"}`}
                      title={upload.parse_error}
                    >
                      {upload.parse_error}
                    </span>
                  )}
                  {upload.qc_status_message && (
                    <span
                      className={`truncate ${
                        isQCActive ? "text-purple-600" : "text-orange-600"
                      }`}
                      title={upload.qc_status_message}
                    >
                      {upload.qc_status_message}
                    </span>
                  )}
                </div>
                {/* Processing model — 3rd line */}
                {(isLiveProcessing || isQueued) && (
                  <div className="text-xs font-mono text-blue-400">
                    {PRESET_LABELS[processingPreset]}
                  </div>
                )}
                {!isLiveProcessing && !isQueued && upload.processing_settings && (
                  <div className="text-xs font-mono text-gray-400">
                    {upload.processing_settings.model}
                    {" · "}
                    {upload.processing_settings.thinkingLevel} thinking
                    {" · "}
                    {upload.processing_settings.mediaResolution === "MEDIA_RESOLUTION_HIGH" ? "high res" : "default res"}
                    {upload.verification_settings && (
                      <span className="ml-2 text-gray-300">
                        | verified: {upload.verification_settings.model}
                      </span>
                    )}
                  </div>
                )}
                {/* Processing timestamps — 4th line */}
                {(() => {
                  const ts = timestamps[upload.id];
                  if (!ts) return null;
                  const parts: string[] = [];
                  if (ts.q) parts.push(`queued:${formatTime(ts.q)}`);
                  if (ts.s) parts.push(`started:${formatTime(ts.s)}`);
                  if (ts.e) parts.push(`completed:${formatTime(ts.e)}`);
                  if (parts.length === 0) return null;
                  const count = processCount[upload.id] ?? 0;
                  return (
                    <div className="text-xs font-mono text-blue-500">
                      {count >= 2 && <span className="font-semibold">#{count} </span>}
                      {parts.join(" ")}
                    </div>
                  );
                })()}
              </div>

              {/* Status badge */}
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
              >
                {(isLiveProcessing || isQCActive) && <Spinner className="h-3 w-3" />}
                {isConfirmed ? "Saved" : status.label}
                {isLiveProcessing && ts?.s && (
                  <ElapsedTimer since={ts.s} />
                )}
                {hasEnded && ts?.s && (
                  <StaticElapsed start={ts.s} end={ts.e!} />
                )}
              </span>

              {/* Actions — fixed width to prevent layout shift */}
              <div className="flex shrink-0 items-center justify-end gap-1 w-[120px]">
                {hasReview && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReview(isExpanded ? "" : upload.id);
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                      isExpanded
                        ? "bg-gray-200 text-gray-700"
                        : isConfirmed
                          ? "border text-gray-600 hover:bg-gray-50"
                          : "bg-green-600 text-white hover:bg-green-700"
                    }`}
                  >
                    {isExpanded ? "Hide" : "View"}
                  </button>
                )}

                {!isLiveProcessing && !isConfirmed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(upload.id);
                    }}
                    className="rounded-md p-2.5 text-xs text-gray-400 hover:text-red-600 sm:px-2 sm:py-1.5"
                    title="Delete"
                  >
                    <svg
                      className="h-5 w-5 sm:h-4 sm:w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Compact inline data summary (when not expanded into full review) */}
            {!isExpanded && hasReview && <InlineSummary upload={upload} />}

            {/* Inline review panel */}
            {isExpanded && reviewingUpload && (
              <div ref={reviewRef} className="mt-1">
                <UploadReview
                  upload={reviewingUpload}
                  onReprocess={onReprocess}
                  onClose={onCloseReview}
                  onSaved={onSaved}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Rotating investing wisdom quotes while processing */}
      {batchTotal > 0 && batchDone < batchTotal && <ProcessingQuotes />}
    </div>
  );
}
