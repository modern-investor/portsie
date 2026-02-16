export interface BrokerageInfo {
  id: string;
  name: string;
  shortName: string;
  description: string;
  hasApiSupport: boolean;
  parentCompany?: string;
  logoPlaceholder: string;
}

export const BROKERAGES: BrokerageInfo[] = [
  {
    id: "schwab",
    name: "Charles Schwab",
    shortName: "Schwab",
    description: "Connect via API or upload portfolio files",
    hasApiSupport: true,
    logoPlaceholder: "CS",
  },
  {
    id: "fidelity",
    name: "Fidelity Investments",
    shortName: "Fidelity",
    description: "Upload statements and portfolio files",
    hasApiSupport: false,
    logoPlaceholder: "FI",
  },
  {
    id: "vanguard",
    name: "Vanguard",
    shortName: "Vanguard",
    description: "Upload statements and portfolio files",
    hasApiSupport: false,
    logoPlaceholder: "VG",
  },
  {
    id: "td-ameritrade",
    name: "TD Ameritrade",
    shortName: "TD Ameritrade",
    description: "Now part of Charles Schwab",
    hasApiSupport: false,
    parentCompany: "Charles Schwab",
    logoPlaceholder: "TD",
  },
  {
    id: "etrade",
    name: "E*TRADE",
    shortName: "E*TRADE",
    description: "Upload statements and portfolio files",
    hasApiSupport: false,
    parentCompany: "Morgan Stanley",
    logoPlaceholder: "ET",
  },
  {
    id: "interactive-brokers",
    name: "Interactive Brokers",
    shortName: "IBKR",
    description: "Upload statements and portfolio files",
    hasApiSupport: false,
    logoPlaceholder: "IB",
  },
  {
    id: "robinhood",
    name: "Robinhood",
    shortName: "Robinhood",
    description: "Upload statements and portfolio files",
    hasApiSupport: false,
    logoPlaceholder: "RH",
  },
  {
    id: "merrill-edge",
    name: "Merrill Edge",
    shortName: "Merrill",
    description: "Upload statements and portfolio files",
    hasApiSupport: false,
    parentCompany: "Bank of America",
    logoPlaceholder: "ME",
  },
  {
    id: "jpmorgan",
    name: "J.P. Morgan Self-Directed",
    shortName: "J.P. Morgan",
    description: "Upload statements and portfolio files",
    hasApiSupport: false,
    logoPlaceholder: "JP",
  },
  {
    id: "ally-invest",
    name: "Ally Invest",
    shortName: "Ally",
    description: "Upload statements and portfolio files",
    hasApiSupport: false,
    logoPlaceholder: "AI",
  },
];

export function getBrokerageById(id: string): BrokerageInfo | undefined {
  return BROKERAGES.find((b) => b.id === id);
}
