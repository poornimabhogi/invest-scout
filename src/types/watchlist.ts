export type MacdTrendFilter = 'any' | 'bullish' | 'bearish' | 'neutral' | 'insufficient';

export interface WatchlistCriteria {
  id: string;
  name: string;
  description?: string;
  minChangePct: number;
  maxChangePct: number;
  minVolumeRatio: number;
  minMarketCap: number;
  rsiMin: number;
  rsiMax: number;
  macdTrend: MacdTrendFilter;
  momentumTiers: string[];
  minCompositeScore: number;
  minCelebrityScore: number;
  minMomentumScore: number;
  aiRecommendations: string[];
  requireAbove50DayMA: boolean;
  maxItems: number;
}

export interface WatchlistMatchReason {
  key: string;
  label: string;
  ok: boolean;
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  price: number;
  changePercentage: number;
  volume: number;
  marketCap: number;
  sector: string;
  momentumTier: string;
  momentumScore: number;
  compositeScore: number;
  volumeRatio: number;
  rsi: number | null;
  macdTrend: string;
  macd: number | null;
  macdSignal: number | null;
  isPinned: boolean;
  isTopPick: boolean;
  signalSources: string[];
  watchlistScore: number;
  matchReasons: WatchlistMatchReason[];
}

export interface WatchlistResponse {
  items: WatchlistItem[];
  criteria: WatchlistCriteria;
  settings: {
    activePresetId: string;
    pinnedSymbols: string[];
    excludedSymbols: string[];
    customCriteria: WatchlistCriteria;
    updatedAt: string | null;
  };
  presets: WatchlistCriteria[];
  generatedAt: string;
}

export interface WatchlistSettingsUpdate {
  activePresetId?: string;
  customCriteria?: Partial<WatchlistCriteria>;
  pinnedSymbols?: string[];
  excludedSymbols?: string[];
}
