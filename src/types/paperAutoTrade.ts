export interface AutoTradeSettings {
  enabled: boolean;
  maxPositions: number;
  positionSizePct: number;
  minStrategyScore: number;
  minVerifiedPerfScore: number;
  buyTopPicks: boolean;
  buyChartVerified: boolean;
  buyPremiumEntry: boolean;
  sellOnAvoid: boolean;
  useStopLossTakeProfit: boolean;
  requireChartAudit: boolean;
  applySelfAnalyzeGates: boolean;
  cooldownHours: number;
  lastRunAt: string | null;
  lastActions: AutoTradeAction[];
  strategyStats: Record<string, StrategyTrackStats>;
  lastRiskContext?: {
    riskLevel: string;
    positionSizePct: number;
    maxDailyTrades: number;
    minStrategyScore: number;
    compoundHint: {
      positionPct: number;
      projectedReturnPct: number;
      winRatePct: number;
      avgWinPct: number;
      avgLossPct: number;
    };
  } | null;
}

export interface AutoTradeAction {
  side: 'buy' | 'sell';
  symbol: string;
  shares: number;
  price: number;
  strategy: string;
  reason: string;
  at: string;
}

export interface StrategyTrackStats {
  buys: number;
  sells: number;
  symbols: string[];
}

export interface AutoTradeStatus {
  settings: AutoTradeSettings;
  strategyStats: Record<string, StrategyTrackStats>;
  recentAutoTrades: import('./paper').PaperTrade[];
  isRunning: boolean;
  riskContext?: AutoTradeSettings['lastRiskContext'];
  selfAnalyzeGate?: { allow: boolean; reason: string };
  autoBuysToday?: number;
}

export interface AutoTradeRunResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  ranAt?: string;
  actions?: AutoTradeAction[];
  errors?: { symbol: string; side: string; error: string }[];
  strategyStats?: Record<string, StrategyTrackStats>;
  candidatesScanned?: number;
  portfolio?: import('./paper').PaperPortfolio;
}
