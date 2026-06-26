export interface BacktestStats {
  sampleSize: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  expectancyPct: number;
}

export interface PriceForecast {
  symbol: string;
  currentPrice: number;
  forecastDate: string;
  pointEstimate: number;
  lowEstimate: number;
  highEstimate: number;
  expectedChangePct: number;
  direction: 'up' | 'down' | 'flat';
  confidence: number;
  atr: number;
  rsi: number;
  backtest: BacktestStats;
  disclaimer: string;
}

export interface BacktestSummary {
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  sampleTrades: number;
  symbolsTested: number;
  disclaimer: string;
}

export interface CompoundSimulation {
  startingCapital: number;
  endingCapital: number;
  totalReturnPct: number;
  pessimisticEnding: number;
  optimisticEnding: number;
  curve: { day: number; capital: number }[];
  assumptions: {
    winRatePct: number;
    avgWinPct: number;
    avgLossPct: number;
    tradesPerDay: number;
    days: number;
    positionPct: number;
  };
  disclaimer: string;
}
