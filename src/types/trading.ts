export type TradingRiskLevel = 'conservative' | 'moderate' | 'aggressive';

export interface TradingPreferences {
  maxPositionSize: number;
  riskLevel: TradingRiskLevel;
  maxDailyTrades: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
  updatedAt?: string;
}
