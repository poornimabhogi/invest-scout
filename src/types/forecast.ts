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

export interface SelfAnalyzeWrongItem {
  symbol: string;
  targetDate: string;
  confidence: number;
  predicted: number;
  actual: number;
  outcome: string;
  diagnosis: string[];
  simulated?: boolean;
}

export interface SelfAnalyzeReport {
  generatedAt: string;
  summary: string;
  stats: {
    graded: number;
    correct: number;
    directionAccuracy: number;
    rangeAccuracy: number;
    resolvedLive: number;
    simulatedHistorical: number;
  };
  whatWentWrong: SelfAnalyzeWrongItem[];
  strategyAdjustments: string[];
  updatedWeights: Record<string, number>;
  cumulativeStats: Record<string, number>;
  newPredictionsRecorded: number;
  nextTargetDate: string;
}

export interface SelfAnalyzeState {
  report: SelfAnalyzeReport | null;
  pendingCount: number;
  learnings: {
    weights: Record<string, number>;
    lessons: { date: string; text: string; applied: boolean }[];
    stats: Record<string, number>;
    lastUpdated: string | null;
  };
  recentPredictions: unknown[];
}
