export interface SchwabTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  id_token?: string;
}

export interface SchwabTokenRecord {
  id: string;
  user_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface DecryptedTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

export interface SchwabAccountNumber {
  accountNumber: string;
  hashValue: string;
}

export interface SchwabAccount {
  securitiesAccount: {
    type: string;
    accountNumber: string;
    roundTrips: number;
    isDayTrader: boolean;
    isClosingOnlyRestricted: boolean;
    pfcbFlag: boolean;
    positions?: SchwabPosition[];
    currentBalances?: SchwabBalances;
    initialBalances?: SchwabBalances;
    projectedBalances?: SchwabBalances;
  };
  aggregatedBalance?: {
    currentLiquidationValue: number;
    liquidationValue: number;
  };
}

export interface SchwabPosition {
  shortQuantity: number;
  averagePrice: number;
  currentDayProfitLoss: number;
  currentDayProfitLossPercentage: number;
  longQuantity: number;
  settledLongQuantity: number;
  settledShortQuantity: number;
  instrument: {
    assetType: string;
    cusip: string;
    symbol: string;
    description?: string;
    netChange?: number;
  };
  marketValue: number;
  maintenanceRequirement?: number;
  averageLongPrice?: number;
  taxLotAverageLongPrice?: number;
  longOpenProfitLoss?: number;
  previousSessionLongQuantity?: number;
  currentDayCost?: number;
}

export interface SchwabBalances {
  liquidationValue: number;
  cashBalance: number;
  availableFunds: number;
  totalCash: number;
  moneyMarketFund?: number;
  savings?: number;
  equity?: number;
  longMarketValue?: number;
  shortMarketValue?: number;
  longOptionMarketValue?: number;
  shortOptionMarketValue?: number;
  maintenanceRequirement?: number;
  buyingPower?: number;
  dayTradingBuyingPower?: number;
}

export interface SchwabQuote {
  assetMainType: string;
  assetSubType?: string;
  symbol: string;
  quote: {
    lastPrice: number;
    openPrice: number;
    highPrice: number;
    lowPrice: number;
    closePrice: number;
    netChange: number;
    netPercentChange: number;
    totalVolume: number;
    bidPrice: number;
    askPrice: number;
    mark: number;
    "52WeekHigh": number;
    "52WeekLow": number;
  };
  reference: {
    description: string;
    exchange: string;
    exchangeName: string;
  };
  fundamental?: {
    peRatio: number;
    dividendYield: number;
    marketCap: number;
  };
}
