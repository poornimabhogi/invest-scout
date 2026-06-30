import { MomentumTier } from './stock';
import { IndicatorAudit } from '@/components/ChartIndicatorChecklist';

export type MediaSourceType = 'tv' | 'social' | 'news';
export type MediaContentType = 'article' | 'video' | 'social';

export interface MediaMention {
  id: string;
  symbol: string;
  name: string;
  headline: string;
  excerpt: string;
  url: string;
  source: string;
  sourceType: MediaSourceType;
  contentType?: MediaContentType;
  hasTranscript?: boolean;
  transcriptPreview?: string;
  figureTags?: string[];
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
  tipRanksCount?: number;
  vipCount?: number;
  videoCount?: number;
  xSocialCount?: number;
  transcriptCount?: number;
  feedStatus: Record<string, { ok: boolean; count?: number; error?: string; at: string }>;
}

export interface MediaIndicatorAuditEntry {
  symbol: string;
  pass: boolean;
  reason: string;
  recommendation?: string | null;
  indicatorAudit?: IndicatorAudit | null;
  mediaSource?: string;
}

export interface MediaProcessingResult {
  processedAt: string | null;
  suggestions: MediaChartSuggestion[];
  rejected: { symbol: string; reason: string; recommendation?: string | null; indicatorAudit?: IndicatorAudit | null }[];
  audits?: MediaIndicatorAuditEntry[];
  stats: {
    scanned: number;
    passed: number;
    rejected: number;
  };
}

export interface MediaChartSuggestion {
  symbol: string;
  name: string;
  price: number;
  changePercentage: number;
  recommendation: 'buy' | 'watch' | 'avoid';
  strategyScore: number;
  chartPattern: string;
  chartSignals: string[];
  rsi: number;
  macdTrend?: string | null;
  squeezeMomentum?: string | null;
  smcScore: number | null;
  smcRecommendation: string | null;
  msbRecommendation?: string | null;
  msbScore?: number | null;
  utBotRecommendation?: string | null;
  utBotPosition?: string | null;
  confluence?: import('./utBot').StructureConfluence | null;
  indicatorAudit?: IndicatorAudit | null;
  mediaHeadline: string;
  mediaSource: string;
  mediaUrl: string;
  mediaContentType?: MediaContentType;
  hasTranscript?: boolean;
  figureTags?: string[];
  mentionCount: number;
  isEarly: boolean;
  chartReason: string;
  rationale: string;
  momentumTier: string;
  momentumScore: number;
  verifiedPerfScore?: number;
  topPickEligible?: boolean;
}

export interface MediaRadarResponse {
  mentions: MediaMention[];
  earlyHits: MediaMention[];
  tipRanksNews?: MediaMention[];
  vipNews?: MediaMention[];
  videoMentions?: MediaMention[];
  xSocialMentions?: MediaMention[];
  processing?: MediaProcessingResult;
  status: MediaRadarStatus;
}
