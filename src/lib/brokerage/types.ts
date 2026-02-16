export interface BrokerageInfo {
  id: string;
  name: string;
  shortName: string;
  description: string;
  hasApiSupport: boolean;
  parentCompany?: string;
  logoPlaceholder: string;
  logoDomain: string;
}

export const BROKERAGES: BrokerageInfo[] = [
  {
    id: "schwab",
    name: "Charles Schwab",
    shortName: "Schwab",
    description: "Connect via API or upload portfolio files",
    hasApiSupport: true,
    logoPlaceholder: "CS",
    logoDomain: "schwab.com",
  },
  {
    id: "fidelity",
    name: "Fidelity Investments",
    shortName: "Fidelity",
    description: "Upload statements and portfolio files",
    hasApiSupport: false,
    logoPlaceholder: "FI",
    logoDomain: "fidelity.com",
  },
  {
    id: "vanguard",
    name: "Vanguard",
    shortName: "Vanguard",
    description: "Upload statements and portfolio files",
    hasApiSupport: false,
    logoPlaceholder: "VG",
    logoDomain: "vanguard.com",
  },
  {
    id: "td-ameritrade",
    name: "TD Ameritrade",
    shortName: "TD Ameritrade",
    description: "Now part of Charles Schwab",
    hasApiSupport: false,
    parentCompany: "Charles Schwab",
    logoPlaceholder: "TD",
    logoDomain: "tdameritrade.com",
  },
  {
    id: "etrade",
    name: "E*TRADE",
    shortName: "E*TRADE",
    description: "Upload statements and portfolio files",
    hasApiSupport: false,
    parentCompany: "Morgan Stanley",
    logoPlaceholder: "ET",
    logoDomain: "etrade.com",
  },
  {
    id: "interactive-brokers",
    name: "Interactive Brokers",
    shortName: "IBKR",
    description: "Upload statements and portfolio files",
    hasApiSupport: false,
    logoPlaceholder: "IB",
    logoDomain: "interactivebrokers.com",
  },
  {
    id: "robinhood",
    name: "Robinhood",
    shortName: "Robinhood",
    description: "Upload statements and portfolio files",
    hasApiSupport: false,
    logoPlaceholder: "RH",
    logoDomain: "robinhood.com",
  },
  {
    id: "merrill-edge",
    name: "Merrill Edge",
    shortName: "Merrill",
    description: "Upload statements and portfolio files",
    hasApiSupport: false,
    parentCompany: "Bank of America",
    logoPlaceholder: "ME",
    logoDomain: "merrilledge.com",
  },
  {
    id: "jpmorgan",
    name: "J.P. Morgan Self-Directed",
    shortName: "J.P. Morgan",
    description: "Upload statements and portfolio files",
    hasApiSupport: false,
    logoPlaceholder: "JP",
    logoDomain: "jpmorgan.com",
  },
  {
    id: "ally-invest",
    name: "Ally Invest",
    shortName: "Ally",
    description: "Upload statements and portfolio files",
    hasApiSupport: false,
    logoPlaceholder: "AI",
    logoDomain: "ally.com",
  },
];

export function getBrokerageById(id: string): BrokerageInfo | undefined {
  return BROKERAGES.find((b) => b.id === id);
}
