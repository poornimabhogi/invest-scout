import { Database } from '@/integrations/supabase/types';

export type TradingRiskLevel = Database['public']['Enums']['trading_risk_level'];

export interface TradingPreferences {
  id: string;
  userId: string;
  maxPositionSize: number;
  riskLevel: TradingRiskLevel;
  maxDailyTrades: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
}