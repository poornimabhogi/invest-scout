export interface SmcStructureSignal {
  type: 'BOS' | 'CHoCH';
  bias: 'bullish' | 'bearish';
  structure: 'swing' | 'internal';
  price: number;
  time: number;
  barIndex: number;
}

export interface SmcOrderBlock {
  bias: 'bullish' | 'bearish';
  high: number;
  low: number;
  time: number;
  mitigated?: boolean;
}

export interface SmcFairValueGap {
  bias: 'bullish' | 'bearish';
  top: number;
  bottom: number;
  time: number;
  filled?: boolean;
}

export interface SmcOverlayMarker {
  time: number;
  position: 'belowBar' | 'aboveBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown';
  text: string;
}

export interface SmcOverlayPriceLine {
  price: number;
  color: string;
  title: string;
}

export interface SmartMoneyAnalysis {
  attribution: string;
  trend: 'bullish' | 'bearish' | 'neutral';
  internalTrend: 'bullish' | 'bearish' | 'neutral';
  zone: 'premium' | 'equilibrium' | 'discount';
  smcScore: number;
  recommendation: 'buy' | 'watch' | 'avoid';
  signals: string[];
  structureSignals: SmcStructureSignal[];
  orderBlocks: SmcOrderBlock[];
  fairValueGaps: SmcFairValueGap[];
  zones: {
    premium: number;
    equilibrium: number;
    discount: number;
    trailingTop: number;
    trailingBottom: number;
  } | null;
  overlay: {
    markers: SmcOverlayMarker[];
    priceLines: SmcOverlayPriceLine[];
  };
}
