import { buildStrategyForStock } from './strategies.js';
import { getStrategies } from './strategies.js';
import { getMediaRadarSnapshot } from './mediaRadar.js';
import { mergeSignalsIntoScreener, scoreChartVerifiedPerformance } from './signalMerge.js';

const PROCESS_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_SYMBOLS = 30;

let cache = {
  processedAt: null,
  suggestions: [],
  rejected: [],
  audits: [],
  strategyBySymbol: new Map(),
  stats: { scanned: 0, passed: 0, rejected: 0 },
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function collectMediaSymbols(mediaSnapshot) {
  const bySymbol = new Map();

  const add = (mention) => {
    if (!mention?.symbol) return;
    const existing = bySymbol.get(mention.symbol);
    if (!existing || new Date(mention.publishedAt) > new Date(existing.publishedAt)) {
      bySymbol.set(mention.symbol, mention);
    }
  };

  const pools = [
    mediaSnapshot?.earlyHits,
    mediaSnapshot?.tipRanksNews,
    mediaSnapshot?.vipNews,
    mediaSnapshot?.videoMentions,
    mediaSnapshot?.xSocialMentions,
    mediaSnapshot?.mentions,
  ];

  for (const pool of pools) {
    for (const m of pool ?? []) add(m);
  }

  const prioritized = pools.flatMap((pool) => (pool ?? []).map((m) => m.symbol));

  const seen = new Set();
  const ordered = [];
  for (const sym of prioritized) {
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    ordered.push(sym);
  }
  return { bySymbol, ordered: ordered.slice(0, MAX_SYMBOLS) };
}

export function chartConfirmsMedia(strategy) {
  const audit = strategy.indicatorAudit;
  if (audit) {
    if (strategy.recommendation === 'avoid') {
      return { pass: false, reason: audit.rejectionReason || 'Chart analysis recommends avoid' };
    }
    if (audit.confirmsMedia) {
      return { pass: true, reason: audit.primaryReason };
    }
    return { pass: false, reason: audit.rejectionReason || 'Media mention without confirming chart setup' };
  }

  // Legacy fallback
  if (strategy.recommendation === 'avoid') {
    return { pass: false, reason: 'Chart analysis recommends avoid' };
  }
  if (strategy.recommendation === 'buy') {
    return { pass: true, reason: 'Strategy buy aligns with media catalyst' };
  }
  return { pass: false, reason: 'Media mention without confirming chart setup' };
}

function toSuggestion(stock, media, strategy, chartReason) {
  return {
    symbol: strategy.symbol,
    name: stock?.name ?? strategy.name,
    price: strategy.price,
    changePercentage: strategy.changePercentage,
    recommendation: strategy.recommendation,
    strategyScore: strategy.strategyScore,
    chartPattern: strategy.chartPattern,
    chartSignals: strategy.chartSignals?.slice(0, 4) ?? [],
    rsi: strategy.rsi,
    macdTrend: strategy.macdTrend ?? null,
    squeezeMomentum: strategy.squeezeMomentum ?? null,
    smcScore: strategy.smcScore ?? null,
    smcRecommendation: strategy.smcRecommendation ?? null,
    msbRecommendation: strategy.msbRecommendation ?? null,
    msbScore: strategy.msbScore ?? null,
    utBotRecommendation: strategy.utBotRecommendation ?? null,
    utBotPosition: strategy.utBotPosition ?? null,
    confluence: strategy.confluence ?? null,
    indicatorAudit: strategy.indicatorAudit ?? null,
    mediaHeadline: media?.headline ?? '',
    mediaSource: media?.source ?? 'Media Radar',
    mediaUrl: media?.url ?? '',
    mediaContentType: media?.contentType ?? 'article',
    hasTranscript: media?.hasTranscript ?? false,
    figureTags: media?.figureTags ?? [],
    mentionCount: media?.mentionCount ?? 1,
    isEarly: media?.isEarly ?? false,
    chartReason,
    rationale: strategy.rationale,
    momentumTier: stock?.momentumTier ?? 'neutral',
    momentumScore: stock?.momentumScore ?? 0,
    verifiedPerfScore: scoreChartVerifiedPerformance(stock, strategy, {
      strategyScore: strategy.strategyScore,
      recommendation: strategy.recommendation,
      indicatorAudit: strategy.indicatorAudit,
      confluence: strategy.confluence,
      hasTranscript: media?.hasTranscript,
    }),
    topPickEligible:
      (strategy.indicatorAudit?.summary?.bullish ?? 0) >= 2 &&
      stock?.momentumTier !== 'weak' &&
      scoreChartVerifiedPerformance(stock, strategy, {
        strategyScore: strategy.strategyScore,
        recommendation: strategy.recommendation,
        indicatorAudit: strategy.indicatorAudit,
        confluence: strategy.confluence,
      }) >= 7,
  };
}

export async function processMediaSnapshot(mediaSnapshot, stocks, { force = false } = {}) {
  const freshEnough =
    cache.processedAt && Date.now() - new Date(cache.processedAt).getTime() < PROCESS_COOLDOWN_MS;
  if (!force && freshEnough && cache.suggestions.length > 0) {
    return getMediaProcessingResult();
  }

  const stockMap = new Map((stocks ?? []).map((s) => [s.symbol, s]));
  const { bySymbol, ordered } = collectMediaSymbols(mediaSnapshot);

  const suggestions = [];
  const rejected = [];
  const audits = [];
  const strategyBySymbol = new Map();

  for (const symbol of ordered) {
    const stock = stockMap.get(symbol);
    const media = bySymbol.get(symbol);
    if (!stock || !media) continue;

    try {
      const strategy = await buildStrategyForStock(stock);
      const { pass, reason } = chartConfirmsMedia(strategy);

      const auditEntry = {
        symbol,
        pass,
        reason,
        recommendation: strategy.recommendation,
        indicatorAudit: strategy.indicatorAudit,
        mediaSource: media.source,
      };
      audits.push(auditEntry);
      strategyBySymbol.set(symbol, { strategy, media, included: pass, chartReason: reason });

      if (pass && (strategy.recommendation === 'buy' || strategy.recommendation === 'watch')) {
        suggestions.push(toSuggestion(stock, media, strategy, reason));
      } else {
        rejected.push({
          symbol,
          reason,
          recommendation: strategy.recommendation,
          indicatorAudit: strategy.indicatorAudit,
        });
      }
    } catch (err) {
      rejected.push({ symbol, reason: err.message, recommendation: null });
      audits.push({ symbol, pass: false, reason: err.message, indicatorAudit: null });
    }

    await sleep(200);
  }

  suggestions.sort((a, b) => b.strategyScore - a.strategyScore);

  cache = {
    processedAt: new Date().toISOString(),
    suggestions,
    rejected,
    audits,
    strategyBySymbol,
    stats: {
      scanned: ordered.length,
      passed: suggestions.length,
      rejected: rejected.length,
    },
  };

  return getMediaProcessingResult();
}

export function getMediaProcessingResult() {
  return {
    processedAt: cache.processedAt,
    suggestions: cache.suggestions,
    rejected: cache.rejected.slice(0, 20),
    audits: cache.audits,
    stats: cache.stats,
  };
}

export function getMediaStrategyBySymbol() {
  return cache.strategyBySymbol;
}

export function getMediaVerifiedSymbols() {
  return new Set(
    [...cache.strategyBySymbol.entries()]
      .filter(([, v]) => v.included)
      .map(([sym]) => sym)
  );
}

export function getMediaVerifiedSuggestionsMap() {
  const map = new Map();
  for (const s of cache.suggestions ?? []) {
    map.set(s.symbol, s);
  }
  return map;
}

function mergeWithMediaStrategies(strategies, mediaStrategyBySymbol) {
  const map = new Map((strategies ?? []).map((s) => [s.symbol, s]));
  for (const [sym, entry] of mediaStrategyBySymbol ?? []) {
    if (entry.included && entry.strategy) {
      map.set(sym, entry.strategy);
    }
  }
  return [...map.values()];
}

export async function buildMergedScreener(base, { forceProcess = false, processMedia = true } = {}) {
  const stocks = base.stocks ?? [];
  const mediaSnapshot = getMediaRadarSnapshot(stocks);

  if (processMedia || !cache.processedAt) {
    await processMediaSnapshot(mediaSnapshot, stocks, { force: forceProcess });
  }

  const strategies = await getStrategies(stocks, false);
  const mergedStrategies = mergeWithMediaStrategies(strategies, getMediaStrategyBySymbol());

  return mergeSignalsIntoScreener(
    base,
    mergedStrategies,
    mediaSnapshot,
    getMediaVerifiedSymbols(),
    getMediaVerifiedSuggestionsMap()
  );
}
