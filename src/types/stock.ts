export type RiskLevel = 'low' | 'medium' | 'high';

export interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercentage: number;
  riskLevel: RiskLevel;
  marketCap: number;
  volume: number;
}