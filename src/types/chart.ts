export type ChartRange = '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y' | 'MAX';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PerformanceStats {
  lifetime: number;
  ytd: number;
  oneYear: number;
  fiveYear: number;
}

export interface MacdAnalysis {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
  trend: string;
  signals: string[];
}

export interface NewsItem {
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: string;
}

export interface StrategyOpportunity {
  symbol: string;
  name: string;
  price: number;
  changePercentage: number;
  strategyScore: number;
  recommendation: 'buy' | 'watch' | 'avoid';
  momentumScore: number;
  celebrityScore: number;
  chartSignals: string[];
  chartPattern: string;
  rsi: number;
  lifetimeReturn: number;
  newsScore: number;
  recentNews: NewsItem[];
  rationale: string;
}

export interface StockDetail {
  stock: import('./stock').Stock;
  candles: Candle[];
  candlesMax: Candle[];
  performance: PerformanceStats;
  analysis: {
    rsi: number;
    pattern: string;
    signals: string[];
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    macd: MacdAnalysis;
  };
  news: NewsItem[];
  strategy: {
    score: number;
    recommendation: string;
    rationale: string;
  };
  dataSource: string;
}
