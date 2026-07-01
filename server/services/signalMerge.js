import { luxConfirmationQualifies } from './luxConfirmation.js';
import { gainzQualifies } from './gainzAlgo.js';

const MOMENTUM_OK = new Set(['strong', 'building', 'neutral']);

function buildStructureConfluence(strategy) {
  if (!strategy?.confluence) {
    if (!strategy) return null;
    const smc =
      strategy.smcRecommendation === 'buy' ||
      strategy.smcTrend === 'bullish' ||
      strategy.smcZone === 'discount';
    const msb = strategy.msbRecommendation === 'buy' || strategy.msbMarket === 'bullish';
    const squeeze = (strategy.chartSignals ?? []).some((s) =>
      /Squeeze fired|squeeze.*bullish|momentum building/i.test(s)
    );
    const utBot =
      strategy.utBotRecommendation === 'buy' ||
      strategy.utBotPosition === 'long' ||
      strategy.utBotSignal === 'buy';
    const ote =
      strategy.oteRecommendation === 'buy' ||
      (strategy.oteInZone && strategy.oteBias === 'bullish');
    return { smc, msb, squeeze, utBot, ote, dualStructure: smc && msb, tripleConfluence: smc && msb && utBot, premiumEntry: smc && msb && ote };
  }
  return strategy.confluence;
}

function buildLookup(items, key = 'symbol') {
  const map = new Map();
  for (const item of items ?? []) {
    map.set(item[key], item);
  }
  return map;
}

function collectMediaBySymbol(mediaSnapshot) {
  const map = new Map();
  const pools = [
    mediaSnapshot?.earlyHits,
    mediaSnapshot?.tipRanksNews,
    mediaSnapshot?.vipNews,
    mediaSnapshot?.videoMentions,
    mediaSnapshot?.xSocialMentions,
    mediaSnapshot?.mentions,
  ];

  for (const pool of pools) {
    for (const hit of pool ?? []) {
      if (!hit?.symbol) continue;
      const existing = map.get(hit.symbol);
      const mentionCount = (pool ?? []).filter((x) => x.symbol === hit.symbol).length;
      if (!existing || new Date(hit.publishedAt) > new Date(existing.publishedAt)) {
        map.set(hit.symbol, { ...hit, mentionCount: hit.mentionCount24h ?? mentionCount });
      }
    }
  }
  return map;
}

/** Performance score for chart-verified media suggestions (0–20+) */
export function scoreChartVerifiedPerformance(stock, strategy, verifiedSuggestion) {
  let score = 0;
  const audit = verifiedSuggestion?.indicatorAudit ?? strategy?.indicatorAudit;
  const bullish = audit?.summary?.bullish ?? 0;

  score += Math.min((verifiedSuggestion?.strategyScore ?? strategy?.strategyScore ?? 0) / 2.5, 6);
  score += bullish * 1.5;

  if (verifiedSuggestion?.recommendation === 'buy' || strategy?.recommendation === 'buy') score += 3;
  else if (verifiedSuggestion?.recommendation === 'watch') score += 1;

  if (stock.momentumTier === 'strong') score += 4;
  else if (stock.momentumTier === 'building') score += 2.5;
  else if (stock.momentumTier === 'neutral') score += 1;

  if ((stock.changePercentage ?? 0) >= 3) score += 2;
  else if ((stock.changePercentage ?? 0) > 0) score += 1;

  const change52w = stock.momentumSignals?.change52w ?? 0;
  if (change52w >= 25) score += 2;
  else if (change52w > 0) score += 1;

  const volRatio = stock.momentumSignals?.volumeRatio ?? 1;
  if (volRatio >= 1.5) score += 1.5;

  const confluence = verifiedSuggestion?.confluence ?? strategy?.confluence;
  if (confluence?.tripleConfluence) score += 3;
  else if (confluence?.dualStructure) score += 2;

  if (verifiedSuggestion?.hasTranscript) score += 0.5;

  return Math.round(score * 10) / 10;
}

const CHART_VERIFIED_MIN_PERF = 7;
const CHART_VERIFIED_MIN_BULLISH = 2;

function qualifiesForTopPick(stock, strategy, media, mediaVerified, verifiedSuggestion) {
  const classic = stock.celebrityScore >= 1 && stock.momentumTier !== 'weak';

  const strategyHit =
    strategy?.recommendation === 'buy' &&
    MOMENTUM_OK.has(stock.momentumTier) &&
    (strategy.strategyScore ?? 0) >= 12;

  // Media → chart pipeline: only promote when chart analysis confirmed the mention
  const mediaChartOk = media && mediaVerified?.has(stock.symbol);

  const mediaEarly =
    mediaChartOk &&
    media?.isEarly &&
    MOMENTUM_OK.has(stock.momentumTier) &&
    (stock.momentumScore ?? 0) >= 0;

  const mediaWithMomentum =
    mediaChartOk &&
    MOMENTUM_OK.has(stock.momentumTier) &&
    (stock.momentumTier === 'building' || stock.momentumTier === 'strong');

  const mediaStrategyBuy =
    mediaChartOk &&
    strategy?.recommendation === 'buy' &&
    MOMENTUM_OK.has(stock.momentumTier);

  const confluence = buildStructureConfluence(strategy);
  const dualStructureHit =
    confluence?.dualStructure &&
    strategy?.recommendation === 'buy' &&
    MOMENTUM_OK.has(stock.momentumTier);

  // Chart-verified suggestion with strong audit + price/momentum performance
  const isChartVerified = mediaVerified?.has(stock.symbol) || Boolean(verifiedSuggestion);
  const perfScore = verifiedSuggestion
    ? scoreChartVerifiedPerformance(stock, strategy, verifiedSuggestion)
    : 0;
  const bullishIndicators = verifiedSuggestion?.indicatorAudit?.summary?.bullish ?? 0;

  const mediaChartVerifiedPerf =
    isChartVerified &&
    stock.momentumTier !== 'weak' &&
    bullishIndicators >= CHART_VERIFIED_MIN_BULLISH &&
    perfScore >= CHART_VERIFIED_MIN_PERF;

  const premiumEntryHit =
    confluence?.premiumEntry &&
    isChartVerified &&
    stock.momentumTier !== 'weak';

  const luxHit =
    luxConfirmationQualifies(strategy?.luxConfirmation, {
      strongOnly: false,
    }) &&
    strategy?.luxConfirmation?.filters?.smartTrail?.pass &&
    strategy?.luxConfirmation?.filters?.trendStrength?.pass &&
    MOMENTUM_OK.has(stock.momentumTier);

  const gainzStd = strategy?.gainzAlgo?.standard;
  const gainzHit =
    gainzQualifies(gainzStd, { mode: 'standard' }) && MOMENTUM_OK.has(stock.momentumTier);

  const wvfHit =
    (strategy?.wvf?.capitulation || strategy?.wvf?.fearEasing) &&
    MOMENTUM_OK.has(stock.momentumTier);

  return (
    classic ||
    strategyHit ||
    mediaEarly ||
    mediaWithMomentum ||
    mediaStrategyBuy ||
    dualStructureHit ||
    mediaChartVerifiedPerf ||
    premiumEntryHit ||
    luxHit ||
    gainzHit ||
    wvfHit
  );
}

function buildSignalSources(stock, strategy, media, isChartVerified) {
  const sources = [];
  if (stock.celebrityScore >= 1) sources.push('celebrity');
  if (stock.momentumTier === 'strong' || stock.momentumTier === 'building') {
    sources.push('momentum');
  }
  if (strategy?.recommendation === 'buy') sources.push('strategy');
  if (strategy?.luxConfirmation?.signal === 'strong_buy') sources.push('lux-confirmation');
  if (strategy?.gainzAlgo?.standard?.signal === 'buy') sources.push('gainz-algo');
  if (strategy?.wvf?.capitulation || strategy?.wvf?.fearEasing) sources.push('wvf-capitulation');
  if (media || isChartVerified) sources.push('media-radar');
  return sources;
}

function boostedScore(stock, strategy, media, verifiedSuggestion) {
  let score = stock.compositeScore ?? 0;
  if (strategy?.recommendation === 'buy') score += strategy.strategyScore >= 15 ? 4 : 2;
  if (strategy?.recommendation === 'watch') score += 1;
  if (media?.isEarly) score += 3;
  else if (media) score += 1.5;
  if (strategy && media) score += 2;

  const confluence = buildStructureConfluence(strategy);
  if (confluence?.dualStructure) score += 3;
  if (confluence?.tripleConfluence) score += 2;
  if (confluence?.premiumEntry) score += 4;
  if (confluence?.squeeze && confluence?.dualStructure) score += 1;

  if (strategy?.luxConfirmation?.signal === 'strong_buy') score += 4;
  else if (strategy?.luxConfirmation?.signal === 'buy') score += 2;

  if (strategy?.gainzAlgo?.standard?.signal === 'buy') score += 3;
  else if (strategy?.gainzAlgo?.alpha?.signal === 'buy') score += 2;

  if (strategy?.wvf?.capitulation) score += 3;
  else if (strategy?.wvf?.fearEasing) score += 2;

  if (verifiedSuggestion) {
    const perfScore = scoreChartVerifiedPerformance(stock, strategy, verifiedSuggestion);
    score += Math.min(perfScore / 2, 6);
    if (perfScore >= 12) score += 2;
    if (verifiedSuggestion.indicatorAudit?.confirmsMedia) score += 1.5;
  }

  return Math.round(score * 10) / 10;
}

export function mergeSignalsIntoScreener(
  screenerData,
  strategies,
  mediaSnapshot,
  mediaVerified = null,
  verifiedSuggestions = null
) {
  const strategyMap = buildLookup(strategies);
  const mediaMap = collectMediaBySymbol(mediaSnapshot);
  const verified = mediaVerified ?? new Set();
  const suggestionMap =
    verifiedSuggestions instanceof Map
      ? verifiedSuggestions
      : new Map((verifiedSuggestions ?? []).map((s) => [s.symbol, s]));

  let chartVerifiedPromoted = 0;

  const stocks = (screenerData.stocks ?? []).map((stock) => {
    const strategy = strategyMap.get(stock.symbol);
    const media = mediaMap.get(stock.symbol);
    const verifiedSuggestion = suggestionMap.get(stock.symbol);
    const isChartVerified = verified.has(stock.symbol) || Boolean(verifiedSuggestion);
    const verifiedPerfScore = verifiedSuggestion
      ? scoreChartVerifiedPerformance(stock, strategy, verifiedSuggestion)
      : null;

    const confluence = buildStructureConfluence(strategy);
    const signalSources = buildSignalSources(stock, strategy, media, isChartVerified);
    if (!isChartVerified) {
      const idx = signalSources.indexOf('media-radar');
      if (idx >= 0) signalSources.splice(idx, 1);
    }
    const adjustedScore = boostedScore(stock, strategy, media, verifiedSuggestion);

    let aiRecommendation = stock.aiRecommendation;
    if (strategy?.recommendation === 'buy' && MOMENTUM_OK.has(stock.momentumTier)) {
      aiRecommendation = 'buy';
    } else if (
      isChartVerified &&
      verifiedPerfScore != null &&
      verifiedPerfScore >= CHART_VERIFIED_MIN_PERF &&
      stock.momentumTier !== 'weak'
    ) {
      aiRecommendation = strategy?.recommendation === 'avoid' ? stock.aiRecommendation : 'buy';
    } else if (strategy?.recommendation === 'avoid') {
      aiRecommendation = 'sell';
    }

    const qualifies = qualifiesForTopPick(
      stock,
      strategy,
      media,
      verified,
      verifiedSuggestion
    );
    if (qualifies && isChartVerified && verifiedSuggestion) chartVerifiedPromoted += 1;

    return {
      ...stock,
      compositeScore: adjustedScore,
      aiRecommendation,
      signalSources,
      strategyScore: strategy?.strategyScore ?? verifiedSuggestion?.strategyScore ?? null,
      strategyRecommendation: strategy?.recommendation ?? verifiedSuggestion?.recommendation ?? null,
      mediaMentionCount: media?.mentionCount ?? 0,
      confluence: confluence ?? verifiedSuggestion?.confluence ?? null,
      chartVerified: isChartVerified,
      chartVerifiedPerfScore: verifiedPerfScore,
      chartVerifiedReason: verifiedSuggestion?.chartReason ?? null,
      luxConfirmation: strategy?.luxConfirmation ?? null,
      gainzAlgo: strategy?.gainzAlgo ?? null,
      wvf: strategy?.wvf ?? null,
      indicatorAudit: strategy?.indicatorAudit ?? verifiedSuggestion?.indicatorAudit ?? null,
      isTopPick: false,
    };
  });

  stocks.sort((a, b) => b.compositeScore - a.compositeScore);

  const topPicks = stocks
    .filter((s) =>
      qualifiesForTopPick(
        s,
        strategyMap.get(s.symbol),
        mediaMap.get(s.symbol),
        verified,
        suggestionMap.get(s.symbol)
      )
    )
    .slice(0, 20);
  topPicks.forEach((s) => {
    s.isTopPick = true;
  });

  const momentumLeaders = [...stocks]
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, 20);

  const celebrityPicks = stocks
    .filter((s) => s.celebrityScore >= 2)
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 20);

  return {
    ...screenerData,
    stocks,
    topPicks,
    momentumLeaders,
    celebrityPicks,
    signalMerge: {
      mergedAt: new Date().toISOString(),
      strategyCount: strategies?.length ?? 0,
      mediaEarlyCount: mediaSnapshot?.earlyHits?.length ?? 0,
      mediaMentionCount: mediaSnapshot?.mentions?.length ?? 0,
      mediaChartVerifiedCount: verified.size,
      chartVerifiedTopPickCount: chartVerifiedPromoted,
      topPickCount: topPicks.length,
    },
  };
}
