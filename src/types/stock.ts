export type RiskLevel = 'low' | 'medium' | 'high';
export type MarketType = 'NASDAQ' | 'NYSE' | 'OTHER';
export type AIRecommendation = 'buy' | 'sell' | 'hold';
export type MomentumTier = 'strong' | 'building' | 'neutral' | 'weak';
export type ScreenerView = 'top-picks' | 'momentum' | 'celebrity' | 'strategies' | 'media-radar' | 'watchlist' | 'all';

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

import { StructureConfluence } from './utBot';

export type SignalSource = 'celebrity' | 'strategy' | 'media-radar' | 'momentum' | 'lux-confirmation' | 'gainz-algo' | 'wvf-capitulation';

export type MarketCapScale = 'large' | 'mid' | 'small' | 'micro' | 'unknown';

export interface Stock {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercentage: number;
  riskLevel: RiskLevel;
  marketCap: number;
  marketCapScale?: MarketCapScale;
  peRatio?: number | null;
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
  signalSources?: SignalSource[];
  strategyScore?: number | null;
  strategyRecommendation?: 'buy' | 'watch' | 'avoid' | null;
  mediaMentionCount?: number;
  confluence?: StructureConfluence | null;
  chartVerified?: boolean;
  chartVerifiedPerfScore?: number | null;
  chartVerifiedReason?: string | null;
  luxConfirmation?: {
    signal: string;
    isStrong?: boolean;
    classification?: number;
    classificationLabel?: string;
    candleColor?: string;
    exitSignal?: boolean;
  } | null;
  gainzAlgo?: {
    standard?: { signal: string; confidence?: number; allLayersPass?: boolean };
    alpha?: { signal: string; confidence?: number };
    pro?: { signal: string; confidence?: number; score?: number };
  } | null;
  wvf?: {
    value?: number | null;
    capitulation?: boolean;
    fearEasing?: boolean;
    recommendation?: string;
    signals?: string[];
  } | null;
  indicatorAudit?: import('@/components/ChartIndicatorChecklist').IndicatorAudit | null;
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
