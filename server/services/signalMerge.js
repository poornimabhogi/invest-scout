const MOMENTUM_OK = new Set(['strong', 'building', 'neutral']);

function buildLookup(items, key = 'symbol') {
  const map = new Map();
  for (const item of items ?? []) {
    map.set(item[key], item);
  }
  return map;
}

function collectMediaBySymbol(earlyHits, mentions) {
  const map = new Map();
  for (const hit of earlyHits ?? []) {
    map.set(hit.symbol, { ...hit, mentionCount: hit.mentionCount24h ?? 1 });
  }
  for (const m of mentions ?? []) {
    const existing = map.get(m.symbol);
    if (!existing || new Date(m.publishedAt) > new Date(existing.publishedAt)) {
      map.set(m.symbol, {
        ...m,
        mentionCount: (mentions ?? []).filter((x) => x.symbol === m.symbol).length,
      });
    }
  }
  return map;
}

function qualifiesForTopPick(stock, strategy, media) {
  const classic = stock.celebrityScore >= 1 && stock.momentumTier !== 'weak';

  const strategyHit =
    strategy?.recommendation === 'buy' &&
    MOMENTUM_OK.has(stock.momentumTier) &&
    (strategy.strategyScore ?? 0) >= 12;

  const mediaEarly =
    media?.isEarly &&
    MOMENTUM_OK.has(stock.momentumTier) &&
    (stock.momentumScore ?? 0) >= 0;

  const mediaWithMomentum =
    media &&
    MOMENTUM_OK.has(stock.momentumTier) &&
    (stock.momentumTier === 'building' || stock.momentumTier === 'strong');

  return classic || strategyHit || mediaEarly || mediaWithMomentum;
}

function buildSignalSources(stock, strategy, media) {
  const sources = [];
  if (stock.celebrityScore >= 1) sources.push('celebrity');
  if (stock.momentumTier === 'strong' || stock.momentumTier === 'building') {
    sources.push('momentum');
  }
  if (strategy?.recommendation === 'buy') sources.push('strategy');
  if (media) sources.push('media-radar');
  return sources;
}

function boostedScore(stock, strategy, media) {
  let score = stock.compositeScore ?? 0;
  if (strategy?.recommendation === 'buy') score += strategy.strategyScore >= 15 ? 4 : 2;
  if (strategy?.recommendation === 'watch') score += 1;
  if (media?.isEarly) score += 3;
  else if (media) score += 1.5;
  if (strategy && media) score += 2;
  return Math.round(score * 10) / 10;
}

export function mergeSignalsIntoScreener(screenerData, strategies, mediaSnapshot) {
  const strategyMap = buildLookup(strategies);
  const mediaMap = collectMediaBySymbol(mediaSnapshot?.earlyHits, mediaSnapshot?.mentions);
  const stocks = (screenerData.stocks ?? []).map((stock) => {
    const strategy = strategyMap.get(stock.symbol);
    const media = mediaMap.get(stock.symbol);
    const signalSources = buildSignalSources(stock, strategy, media);
    const adjustedScore = boostedScore(stock, strategy, media);

    let aiRecommendation = stock.aiRecommendation;
    if (strategy?.recommendation === 'buy' && MOMENTUM_OK.has(stock.momentumTier)) {
      aiRecommendation = 'buy';
    } else if (strategy?.recommendation === 'avoid') {
      aiRecommendation = 'sell';
    }

    return {
      ...stock,
      compositeScore: adjustedScore,
      aiRecommendation,
      signalSources,
      strategyScore: strategy?.strategyScore ?? null,
      strategyRecommendation: strategy?.recommendation ?? null,
      mediaMentionCount: media?.mentionCount ?? 0,
      isTopPick: false,
    };
  });

  stocks.sort((a, b) => b.compositeScore - a.compositeScore);

  const topPicks = stocks
    .filter((s) => qualifiesForTopPick(s, strategyMap.get(s.symbol), mediaMap.get(s.symbol)))
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
      topPickCount: topPicks.length,
    },
  };
}
