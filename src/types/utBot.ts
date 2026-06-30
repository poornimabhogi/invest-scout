export interface UtBotEvent {
  type: 'buy' | 'sell';
  time: number;
  price: number;
  barIndex: number;
}

export interface UtBotAnalysis {
  attribution: string;
  position: 'long' | 'short' | 'neutral';
  signal: 'buy' | 'sell' | 'none';
  trailingStop: number | null;
  keyValue: number;
  atrPeriod: number;
  utScore: number;
  recommendation: 'buy' | 'watch' | 'avoid';
  signals: string[];
  lastBuy: UtBotEvent | null;
  lastSell: UtBotEvent | null;
  overlay: {
    markers: import('./smc').SmcOverlayMarker[];
    priceLines: import('./smc').SmcOverlayPriceLine[];
  };
}

export interface StructureConfluence {
  smc: boolean;
  msb: boolean;
  squeeze: boolean;
  utBot: boolean;
  ote?: boolean;
  dualStructure: boolean;
  tripleConfluence: boolean;
  premiumEntry?: boolean;
}
