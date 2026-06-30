export interface PaperPosition {
  symbol: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  priceIsLive?: boolean;
  marketValue: number;
  costBasis: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
}

export interface PaperTrade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  shares: number;
  price: number;
  total: number;
  note?: string;
  timestamp: string;
  strategy?: string;
  auto?: boolean;
  signalReason?: string;
}

export interface PaperStats {
  closedTrades: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
}

export interface PaperPortfolio {
  cash: number;
  startingCash: number;
  positions: PaperPosition[];
  positionsValue: number;
  totalEquity: number;
  totalReturn: number;
  totalReturnPct: number;
  trades: PaperTrade[];
  stats: PaperStats;
  pricesRefreshedAt?: string;
}
