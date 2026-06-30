export interface OteZone {
  bias: 'bullish' | 'bearish';
  oteTop: number;
  oteBottom: number;
  swingHigh: number;
  swingLow: number;
  equilibrium: number;
  fibLow: number;
  fibHigh: number;
  currentPrice: number;
  swingHighTime?: number;
  swingLowTime?: number;
}

export interface OptimalTradeEntryAnalysis {
  attribution: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  inOteZone: boolean;
  nearOteZone: boolean;
  oteScore: number;
  recommendation: 'buy' | 'watch' | 'avoid';
  signals: string[];
  zone: OteZone | null;
  overlay: {
    markers: import('./smc').SmcOverlayMarker[];
    priceLines: import('./smc').SmcOverlayPriceLine[];
  };
}
