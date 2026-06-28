import { MomentumTier } from './stock';

export type MediaSourceType = 'tv' | 'social' | 'news';

export interface MediaMention {
  id: string;
  symbol: string;
  name: string;
  headline: string;
  excerpt: string;
  url: string;
  source: string;
  sourceType: MediaSourceType;
  publishedAt: string;
  detectedAt: string;
  price: number;
  changePercentage: number;
  momentumTier: MomentumTier;
  momentumScore: number;
  isEarly: boolean;
  mentionCount24h?: number;
}

export interface MediaRadarStatus {
  isMonitoring: boolean;
  lastPollAt: string | null;
  pollIntervalSeconds: number;
  feedsTotal: number;
  feedsActive: number;
  mentionCount: number;
  earlyCount: number;
  feedStatus: Record<string, { ok: boolean; count?: number; error?: string; at: string }>;
}

export interface MediaRadarResponse {
  mentions: MediaMention[];
  earlyHits: MediaMention[];
  status: MediaRadarStatus;
}
