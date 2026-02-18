// ============================================================================
// Quiltt GraphQL client (server-to-server with Basic Auth)
// ============================================================================

import { QUILTT_CONFIG, getQuilttApiSecret } from "./config";
import type {
  QuilttAccount,
  QuilttHolding,
  QuilttHoldingConnection,
  QuilttBalance,
  QuilttTransaction,
  QuilttTransactionConnection,
} from "./types";

/**
 * Server-side GraphQL client using Basic Auth.
 * Basic Auth = Base64(profileId:apiSecret) — no rate limits.
 */
export class QuilttGraphQLClient {
  private profileId: string;
  private authHeader: string;

  constructor(profileId: string) {
    this.profileId = profileId;
    const secret = getQuilttApiSecret();
    const credentials = Buffer.from(`${profileId}:${secret}`).toString(
      "base64"
    );
    this.authHeader = `Basic ${credentials}`;
  }

  private async query<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(QUILTT_CONFIG.graphqlUrl, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Quiltt GraphQL error (${response.status}): ${errorText}`
      );
    }

    const result = await response.json();

    if (result.errors?.length) {
      throw new Error(
        `Quiltt GraphQL errors: ${JSON.stringify(result.errors)}`
      );
    }

    return result.data as T;
  }

  /**
   * Fetch all accounts for this profile.
   */
  async getAccounts(): Promise<QuilttAccount[]> {
    const data = await this.query<{ accounts: { nodes: QuilttAccount[] } }>(`
      query {
        accounts {
          nodes {
            id
            name
            mask
            type
            kind
            verified
            currencyCode
            institution {
              id
              name
              url
              logo
            }
            connection {
              id
              institution {
                id
                name
              }
              status
            }
            balance {
              id
              available
              current
              limit
              at
            }
            taxonomy {
              classification
              category
              type
            }
            transactedFirstOn
            transactedLastOn
          }
        }
      }
    `);

    return data.accounts.nodes;
  }

  /**
   * Fetch a single account by ID.
   */
  async getAccount(accountId: string): Promise<QuilttAccount | null> {
    const data = await this.query<{ account: QuilttAccount | null }>(
      `
      query($id: ID!) {
        account(id: $id) {
          id
          name
          mask
          type
          kind
          verified
          currencyCode
          institution {
            id
            name
            url
            logo
          }
          connection {
            id
            institution {
              id
              name
            }
            status
          }
          balance {
            id
            available
            current
            limit
            at
          }
          taxonomy {
            classification
            category
            type
          }
          transactedFirstOn
          transactedLastOn
        }
      }
    `,
      { id: accountId }
    );

    return data.account;
  }

  /**
   * Fetch holdings (investment positions) for an account.
   * Paginated — fetches all pages.
   */
  async getHoldings(accountId: string): Promise<QuilttHolding[]> {
    const allHoldings: QuilttHolding[] = [];
    let cursor: string | null = null;

    // eslint-disable-next-line no-constant-condition
    for (;;) {
      type HoldingsResult = { account: { holdings: QuilttHoldingConnection } };
      const result: HoldingsResult = await this.query(
        `
        query($id: ID!, $after: String) {
          account(id: $id) {
            holdings(first: 100, after: $after) {
              count
              nodes {
                id
                at
                costBasis
                price
                quantity
                value
                security {
                  id
                  name
                  tickerSymbol
                  cusip
                  isin
                  type
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `,
        { id: accountId, after: cursor }
      );

      const connection = result.account.holdings;
      allHoldings.push(...connection.nodes);

      if (!connection.pageInfo.hasNextPage) break;
      cursor = connection.pageInfo.endCursor;
    }

    return allHoldings;
  }

  /**
   * Fetch the latest balance for an account.
   */
  async getBalance(accountId: string): Promise<QuilttBalance | null> {
    const data = await this.query<{
      account: { balance: QuilttBalance | null };
    }>(
      `
      query($id: ID!) {
        account(id: $id) {
          balance {
            id
            available
            current
            limit
            at
          }
        }
      }
    `,
      { id: accountId }
    );

    return data.account?.balance ?? null;
  }

  /**
   * Fetch transactions for an account.
   * Paginated — fetches all pages.
   */
  async getTransactions(
    accountId: string,
    after?: string
  ): Promise<QuilttTransaction[]> {
    const allTransactions: QuilttTransaction[] = [];
    let cursor: string | null = after ?? null;

    // eslint-disable-next-line no-constant-condition
    for (;;) {
      type TxResult = { account: { transactions: QuilttTransactionConnection } };
      const result: TxResult = await this.query(
        `
        query($id: ID!, $after: String) {
          account(id: $id) {
            transactions(first: 100, after: $after) {
              count
              nodes {
                id
                date
                amount
                description
                status
                entryType
                currencyCode
                category
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `,
        { id: accountId, after: cursor }
      );

      const txConnection = result.account.transactions;
      allTransactions.push(...txConnection.nodes);

      if (!txConnection.pageInfo.hasNextPage) break;
      cursor = txConnection.pageInfo.endCursor;
    }

    return allTransactions;
  }
}
