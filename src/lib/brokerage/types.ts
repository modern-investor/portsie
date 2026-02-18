export interface BrokerageInfo {
  id: string;
  name: string;
  shortName: string;
  description: string;
  hasApiSupport: boolean;
  hasQuilttSupport: boolean;
  /** Pre-filter the Quiltt connector to this institution name */
  quilttInstitutionSearch?: string;
  parentCompany?: string;
  logoPlaceholder: string;
  logoDomain: string;
}

export const BROKERAGES: BrokerageInfo[] = [
  {
    id: "schwab",
    name: "Charles Schwab",
    shortName: "Schwab",
    description: "Connect via API, Open Banking, or upload portfolio files",
    hasApiSupport: true,
    hasQuilttSupport: true,
    quilttInstitutionSearch: "Charles Schwab",
    logoPlaceholder: "CS",
    logoDomain: "schwab.com",
  },
  {
    id: "fidelity",
    name: "Fidelity Investments",
    shortName: "Fidelity",
    description: "Connect via Open Banking or upload portfolio files",
    hasApiSupport: false,
    hasQuilttSupport: true,
    quilttInstitutionSearch: "Fidelity",
    logoPlaceholder: "FI",
    logoDomain: "fidelity.com",
  },
  {
    id: "vanguard",
    name: "Vanguard",
    shortName: "Vanguard",
    description: "Connect via Open Banking or upload portfolio files",
    hasApiSupport: false,
    hasQuilttSupport: true,
    quilttInstitutionSearch: "Vanguard",
    logoPlaceholder: "VG",
    logoDomain: "vanguard.com",
  },
  {
    id: "td-ameritrade",
    name: "TD Ameritrade",
    shortName: "TD Ameritrade",
    description: "Now part of Charles Schwab",
    hasApiSupport: false,
    hasQuilttSupport: true,
    quilttInstitutionSearch: "TD Ameritrade",
    parentCompany: "Charles Schwab",
    logoPlaceholder: "TD",
    logoDomain: "tdameritrade.com",
  },
  {
    id: "etrade",
    name: "E*TRADE",
    shortName: "E*TRADE",
    description: "Connect via Open Banking or upload portfolio files",
    hasApiSupport: false,
    hasQuilttSupport: true,
    quilttInstitutionSearch: "E*TRADE",
    parentCompany: "Morgan Stanley",
    logoPlaceholder: "ET",
    logoDomain: "etrade.com",
  },
  {
    id: "interactive-brokers",
    name: "Interactive Brokers",
    shortName: "IBKR",
    description: "Connect via Open Banking or upload portfolio files",
    hasApiSupport: false,
    hasQuilttSupport: true,
    quilttInstitutionSearch: "Interactive Brokers",
    logoPlaceholder: "IB",
    logoDomain: "interactivebrokers.com",
  },
  {
    id: "robinhood",
    name: "Robinhood",
    shortName: "Robinhood",
    description: "Connect via Open Banking or upload portfolio files",
    hasApiSupport: false,
    hasQuilttSupport: true,
    quilttInstitutionSearch: "Robinhood",
    logoPlaceholder: "RH",
    logoDomain: "robinhood.com",
  },
  {
    id: "merrill-edge",
    name: "Merrill Edge",
    shortName: "Merrill",
    description: "Connect via Open Banking or upload portfolio files",
    hasApiSupport: false,
    hasQuilttSupport: true,
    quilttInstitutionSearch: "Merrill",
    parentCompany: "Bank of America",
    logoPlaceholder: "ME",
    logoDomain: "merrilledge.com",
  },
  {
    id: "jpmorgan",
    name: "J.P. Morgan Self-Directed",
    shortName: "J.P. Morgan",
    description: "Connect via Open Banking or upload portfolio files",
    hasApiSupport: false,
    hasQuilttSupport: true,
    quilttInstitutionSearch: "J.P. Morgan",
    logoPlaceholder: "JP",
    logoDomain: "jpmorgan.com",
  },
  {
    id: "ally-invest",
    name: "Ally Invest",
    shortName: "Ally",
    description: "Connect via Open Banking or upload portfolio files",
    hasApiSupport: false,
    hasQuilttSupport: true,
    quilttInstitutionSearch: "Ally",
    logoPlaceholder: "AI",
    logoDomain: "ally.com",
  },
];

export function getBrokerageById(id: string): BrokerageInfo | undefined {
  return BROKERAGES.find((b) => b.id === id);
}
