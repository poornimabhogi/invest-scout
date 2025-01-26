export type RiskLevel = 'low' | 'medium' | 'high';
export type MarketType = 'NASDAQ' | 'NYSE' | 'OTHER';
export type AIRecommendation = 'buy' | 'sell' | 'hold';

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
}