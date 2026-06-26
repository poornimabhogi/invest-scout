export type RiskLevel = 'low' | 'medium' | 'high';
export type MarketType = 'NASDAQ' | 'NYSE' | 'OTHER';
export type AIRecommendation = 'buy' | 'sell' | 'hold';
export type MomentumTier = 'strong' | 'building' | 'neutral' | 'weak';
export type ScreenerView = 'top-picks' | 'momentum' | 'celebrity' | 'strategies' | 'all';

export interface CelebrityHolder {
  id: string;
  name: string;
  firm: string;
}

export interface MomentumSignals {
  change1d: number;
  change52w: number;
  above50DayMA: number;
  above200DayMA: number;
  volumeRatio: number;
}

export interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercentage: number;
  riskLevel: RiskLevel;
  marketCap: number;
  volume: number;
  market: MarketType;
  sector: string;
  aiRecommendation: AIRecommendation;
  aiConfidenceScore: number;
  momentumScore: number;
  momentumTier: MomentumTier;
  momentumSignals: MomentumSignals;
  celebrityScore: number;
  celebrityHolders: CelebrityHolder[];
  compositeScore: number;
  isTopPick: boolean;
}

export interface CelebrityInvestor {
  id: string;
  name: string;
  firm: string;
  description: string;
  holdings: string[];
}

export interface ScreenerStatus {
  lastUpdated: string | null;
  stockCount: number;
  isRefreshing: boolean;
  cacheTtlMinutes: number;
  dataSource: string;
  hasLiveApiKey: boolean;
}
