// ============================================================================
// Quiltt API TypeScript types
// ============================================================================

// --- Session / Auth ---

export interface QuilttSessionResponse {
  token: string;
  userId: string;
  environmentId: string;
  expiresAt: string; // ISO 8601
  expiration: number; // Unix epoch
}

// --- GraphQL: Accounts ---

export interface QuilttInstitution {
  id: string;
  name: string;
  url?: string;
  logo?: string;
}

export interface QuilttConnection {
  id: string;
  institution: QuilttInstitution;
  status: string;
}

export interface QuilttAccountBalance {
  id: string;
  available: number | null;
  current: number | null;
  limit: number | null;
  at: string; // ISO timestamp
}

export interface QuilttAccountTaxonomy {
  classification: string; // "Asset" | "Liability"
  category: string; // "Depository" | "Investment" | "Credit" | "Loan"
  type: string | null; // "Checking" | "Brokerage" | "IRA" etc.
}

export interface QuilttAccount {
  id: string;
  name: string;
  mask: string | null;
  type: string | null;
  kind: string | null;
  verified: boolean;
  currencyCode: string;
  institution: QuilttInstitution | null;
  connection: QuilttConnection;
  balance: QuilttAccountBalance | null;
  taxonomy: QuilttAccountTaxonomy | null;
  transactedFirstOn: string | null;
  transactedLastOn: string | null;
}

// --- GraphQL: Holdings ---

export interface QuilttSecurity {
  id: string;
  name: string | null;
  tickerSymbol: string | null;
  cusip: string | null;
  isin: string | null;
  type: string | null;
}

export interface QuilttHolding {
  id: string;
  at: string; // ISO timestamp
  costBasis: number | null;
  price: number | null;
  quantity: number | null;
  value: number | null;
  security: QuilttSecurity | null;
}

export interface QuilttHoldingConnection {
  count: number;
  nodes: QuilttHolding[];
  pageInfo: QuilttPageInfo;
}

// --- GraphQL: Transactions ---

export interface QuilttTransaction {
  id: string;
  date: string;
  amount: number;
  description: string | null;
  status: string;
  entryType: string | null; // "DEBIT" | "CREDIT"
  currencyCode: string;
  category: string | null;
}

export interface QuilttTransactionConnection {
  count: number;
  nodes: QuilttTransaction[];
  pageInfo: QuilttPageInfo;
}

// --- GraphQL: Balances ---

export interface QuilttBalance {
  id: string;
  accountId: string;
  at: string; // ISO timestamp
  available: number | null;
  current: number | null;
  limit: number | null;
  source: "INITIAL" | "SYNC" | "REFRESH";
}

// --- GraphQL: Pagination ---

export interface QuilttPageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
}

// --- Webhook ---

export interface QuilttWebhookPayload {
  type: string;
  record: {
    id: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
}

// --- Database record (quiltt_profiles table) ---

export interface QuilttProfileRecord {
  id: string;
  user_id: string;
  quiltt_profile_id: string;
  created_at: string;
  updated_at: string;
}
