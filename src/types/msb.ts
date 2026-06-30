export interface MsObZone {
  type: string;
  high: number;
  low: number;
  time: number;
  bias: 'bullish' | 'bearish';
}

export interface MsObBreak {
  type: 'bullish' | 'bearish';
  label: string;
  price: number;
  time: number;
  barIndex: number;
}

export interface MarketStructureAnalysis {
  attribution: string;
  market: 'bullish' | 'bearish' | 'neutral';
  msbScore: number;
  recommendation: 'buy' | 'watch' | 'avoid';
  signals: string[];
  lastMsb: MsObBreak | null;
  structureBreaks?: MsObBreak[];
  activeZones: MsObZone[];
  overlay: {
    markers: import('./smc').SmcOverlayMarker[];
    priceLines: import('./smc').SmcOverlayPriceLine[];
  };
}
