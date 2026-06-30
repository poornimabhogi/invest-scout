import { getApiKey } from './marketProvider.js';
import { getCandles, computePerformance } from './candles.js';
import { analyzeChart, buildStrategyScore } from './chartAnalysis.js';
import { analyzeSmartMoneyConcepts } from './smartMoneyConcepts.js';
import { analyzeMarketStructureBreak } from './marketStructureBreak.js';
import { analyzeUtBot, buildStructureConfluence } from './utBot.js';
import { analyzeOptimalTradeEntry } from './optimalTradeEntry.js';
import { buildIndicatorAudit } from './chartIndicatorAudit.js';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const NEWS_CACHE_TTL = 30 * 60 * 1000;

let strategiesCache = { data: null, cachedAt: 0, isRefreshing: false };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchGoogleNews(symbol) {
  const query = encodeURIComponent(`${symbol} stock news`);
  const url = `https://news.google.com/rss/search?q=${query}+when:7d&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InvestScout/1.0)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
    const block = match[1];
    const title = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
      ?? block.match(/<title>(.*?)<\/title>/)?.[1]
      ?? '';
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? '';
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';
    const source = block.match(/<source[^>]*>(.*?)<\/source>/)?.[1] ?? 'Google News';
    if (title) {
      items.push({
        headline: title.replace(/ - .*$/, '').trim(),
        summary: title,
        source,
        url: link,
        datetime: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      });
    }
  }
  return items;
}

async function fetchFinnhubNews(symbol, apiKey) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const url = `${FINNHUB_BASE}/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];
  const data = await res.json();
  return (data ?? []).slice(0, 5).map((n) => ({
    headline: n.headline,
    summary: n.summary?.slice(0, 200) ?? n.headline,
    source: n.source,
    url: n.url,
    datetime: new Date(n.datetime * 1000).toISOString(),
  }));
}

async function fetchNews(symbol) {
  const apiKey = getApiKey();
  const [google, finnhub] = await Promise.all([
    fetchGoogleNews(symbol),
    apiKey ? fetchFinnhubNews(symbol, apiKey).catch(() => []) : Promise.resolve([]),
  ]);

  const seen = new Set();
  const merged = [];
  for (const item of [...finnhub, ...google]) {
    const key = item.headline.toLowerCase().slice(0, 60);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged.slice(0, 5);
}

export async function buildStrategyForStock(stock) {
  const { candles } = await getCandles(stock.symbol, '1Y');
  const chartAnalysis = analyzeChart(candles);
  const smc = analyzeSmartMoneyConcepts(candles);
  const msb = analyzeMarketStructureBreak(candles);
  const utBot = analyzeUtBot(candles);
  const ote = analyzeOptimalTradeEntry(candles);
  const news = await fetchNews(stock.symbol);
  const { score, recommendation, newsScore } = buildStrategyScore(stock, chartAnalysis, news, smc, msb, utBot, ote);
  const indicatorAudit = buildIndicatorAudit(chartAnalysis, smc, msb, utBot, ote, recommendation);

  return {
    symbol: stock.symbol,
    name: stock.name,
    price: stock.price,
    changePercentage: stock.changePercentage,
    strategyScore: score,
    recommendation,
    momentumScore: stock.momentumScore,
    celebrityScore: stock.celebrityScore,
    chartSignals: [
      ...chartAnalysis.signals,
      ...smc.signals.slice(0, 2),
      ...msb.signals.slice(0, 2),
      ...utBot.signals.slice(0, 1),
      ...ote.signals.slice(0, 1),
    ],
    chartPattern: chartAnalysis.pattern,
    rsi: chartAnalysis.rsi,
    macdTrend: chartAnalysis.macd?.trend ?? 'insufficient',
    squeezeMomentum: chartAnalysis.squeeze?.momentum ?? 'insufficient',
    squeezeOn: chartAnalysis.squeeze?.squeezeOn ?? false,
    squeezeOff: chartAnalysis.squeeze?.squeezeOff ?? false,
    lifetimeReturn: chartAnalysis.lifetimeReturn,
    newsScore,
    recentNews: news,
    rationale: buildRationale(recommendation, chartAnalysis, news, stock, smc),
    smcScore: smc.smcScore,
    smcRecommendation: smc.recommendation,
    smcTrend: smc.trend,
    smcZone: smc.zone,
    msbScore: msb.msbScore,
    msbRecommendation: msb.recommendation,
    msbMarket: msb.market,
    utBotScore: utBot.utScore,
    utBotRecommendation: utBot.recommendation,
    utBotPosition: utBot.position,
    utBotSignal: utBot.signal,
    oteScore: ote.oteScore,
    oteRecommendation: ote.recommendation,
    oteInZone: ote.inOteZone,
    oteBias: ote.bias,
    confluence: buildStructureConfluence({
      smcRecommendation: smc.recommendation,
      smcTrend: smc.trend,
      smcZone: smc.zone,
      msbRecommendation: msb.recommendation,
      msbMarket: msb.market,
      utBotRecommendation: utBot.recommendation,
      utBotPosition: utBot.position,
      utBotSignal: utBot.signal,
      oteRecommendation: ote.recommendation,
      oteInZone: ote.inOteZone,
      oteBias: ote.bias,
      chartSignals: [...chartAnalysis.signals, ...smc.signals, ...msb.signals, ...utBot.signals, ...ote.signals],
    }),
    indicatorAudit,
  };
}

function buildRationale(recommendation, chart, news, stock, smc = null) {
  const parts = [];
  if (recommendation === 'buy') {
    parts.push('Multiple bullish signals align for a potential entry.');
  } else if (recommendation === 'watch') {
    parts.push('Mixed signals — monitor for confirmation before entering.');
  } else {
    parts.push('Risk outweighs reward based on current chart and news flow.');
  }
  if (chart.signals[0]) parts.push(chart.signals[0]);
  if (smc?.signals?.[0]) parts.push(`SMC: ${smc.signals[0]}`);
  if (stock.celebrityScore >= 2) parts.push(`Held by ${stock.celebrityScore} celebrity portfolios.`);
  if (news[0]) parts.push(`Latest: "${news[0].headline.slice(0, 80)}..."`);
  return parts.join(' ');
}

async function computeStrategies(stocks) {
  const candidates = stocks
    .filter((s) => s.aiRecommendation !== 'sell')
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 25);

  const strategies = [];
  for (let i = 0; i < candidates.length; i++) {
    try {
      const strategy = await buildStrategyForStock(candidates[i]);
      if (strategy.recommendation === 'buy' || strategy.recommendation === 'watch') {
        strategies.push(strategy);
      }
    } catch (err) {
      console.warn(`Strategy failed for ${candidates[i].symbol}:`, err.message);
    }
    if (i < candidates.length - 1) await sleep(300);
  }

  return strategies
    .sort((a, b) => b.strategyScore - a.strategyScore)
    .slice(0, 20);
}

export async function getStrategies(stocks, forceRefresh = false) {
  const isStale = Date.now() - strategiesCache.cachedAt > NEWS_CACHE_TTL;

  if (strategiesCache.data && !forceRefresh && !isStale) {
    return strategiesCache.data;
  }

  if (strategiesCache.isRefreshing) {
    while (strategiesCache.isRefreshing) await sleep(500);
    return strategiesCache.data ?? [];
  }

  strategiesCache.isRefreshing = true;
  try {
    const data = await computeStrategies(stocks);
    strategiesCache = { data, cachedAt: Date.now(), isRefreshing: false };
    return data;
  } catch (err) {
    strategiesCache.isRefreshing = false;
    if (strategiesCache.data) return strategiesCache.data;
    throw err;
  }
}

export async function getStockDetail(symbol, stockFromCache) {
  const [{ candles: candles1Y, source }, { candles: candlesMax }] = await Promise.all([
    getCandles(symbol, '1Y'),
    getCandles(symbol, 'MAX'),
  ]);

  const chartCandles = candlesMax.length > candles1Y.length ? candlesMax : candles1Y;
  const analysis = analyzeChart(chartCandles);
  const smc = analyzeSmartMoneyConcepts(chartCandles);
  const msb = analyzeMarketStructureBreak(chartCandles);
  const utBot = analyzeUtBot(chartCandles);
  const ote = analyzeOptimalTradeEntry(chartCandles);
  const news = await fetchNews(symbol);

  const stock = stockFromCache ?? {
    symbol,
    name: symbol,
    price: candles1Y.at(-1)?.close ?? 0,
    changePercentage: 0,
    compositeScore: 0,
    momentumScore: 0,
    celebrityScore: 0,
    momentumTier: 'neutral',
    aiRecommendation: 'hold',
    celebrityHolders: [],
    momentumSignals: {},
    riskLevel: 'medium',
    marketCap: 0,
    volume: 0,
    market: 'OTHER',
    sector: 'Unknown',
    aiConfidenceScore: 0.5,
    isTopPick: false,
    change: 0,
  };

  const { score, recommendation } = buildStrategyScore(stock, analysis, news, smc, msb, utBot, ote);

  const perf1Y = computePerformance(candles1Y);
  const perfMax = computePerformance(candlesMax.length > 0 ? candlesMax : candles1Y);

  return {
    stock,
    candles: candles1Y,
    candlesMax: candlesMax.length > 0 ? candlesMax : candles1Y,
    performance: {
      lifetime: perfMax.lifetime,
      ytd: perf1Y.ytd,
      oneYear: perf1Y.oneYear,
      fiveYear: perfMax.fiveYear,
    },
    analysis: {
      rsi: analysis.rsi,
      pattern: analysis.pattern,
      signals: analysis.signals,
      sma20: analysis.sma20,
      sma50: analysis.sma50,
      sma200: analysis.sma200,
      macd: {
        macd: analysis.macd.macd,
        signal: analysis.macd.signal,
        histogram: analysis.macd.histogram,
        trend: analysis.macd.trend,
        signals: analysis.macd.signals ?? [],
      },
      squeeze: {
        value: analysis.squeeze?.value ?? null,
        squeezeOn: analysis.squeeze?.squeezeOn ?? false,
        squeezeOff: analysis.squeeze?.squeezeOff ?? false,
        momentum: analysis.squeeze?.momentum ?? 'insufficient',
        trend: analysis.squeeze?.trend ?? 'insufficient',
        signals: analysis.squeeze?.signals ?? [],
      },
    },
    news,
    strategy: {
      score,
      recommendation,
      rationale: buildRationale(recommendation, analysis, news, stock, smc),
    },
    smc,
    msb,
    utBot,
    ote,
    dataSource: source,
  };
}
