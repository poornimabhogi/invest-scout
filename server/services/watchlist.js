import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCandles } from './candles.js';
import { getScreenerData } from './screener.js';
import { getStrategies } from './strategies.js';
import { mergeSignalsIntoScreener } from './signalMerge.js';
import { getMediaRadarSnapshot } from './mediaRadar.js';
import { computeRSI, computeMACD } from './chartAnalysis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'watchlist-settings.json');

export const RECOMMENDED_CRITERIA = {
  id: 'recommended',
  name: 'Recommended — Momentum + Confirmation',
  description: 'Building momentum with healthy RSI, MACD confirmation, and solid volume — ranked by match quality',
  minChangePct: -1,
  maxChangePct: 12,
  minVolumeRatio: 1.0,
  minMarketCap: 0,
  rsiMin: 30,
  rsiMax: 72,
  macdTrend: 'any',
  momentumTiers: ['building', 'strong', 'neutral'],
  minCompositeScore: 6,
  minCelebrityScore: 0,
  minMomentumScore: -3,
  aiRecommendations: ['buy', 'hold'],
  requireAbove50DayMA: false,
  maxItems: 20,
};

export const PRESETS = [
  RECOMMENDED_CRITERIA,
  {
    id: 'momentum-breakout',
    name: 'Momentum Breakout',
    description: 'Strong movers with volume spike and MACD expansion',
    minChangePct: 1.5,
    maxChangePct: 15,
    minVolumeRatio: 1.5,
    minMarketCap: 300_000_000,
    rsiMin: 45,
    rsiMax: 75,
    macdTrend: 'bullish',
    momentumTiers: ['strong', 'building'],
    minCompositeScore: 9,
    minCelebrityScore: 0,
    minMomentumScore: 3,
    aiRecommendations: ['buy', 'hold'],
    requireAbove50DayMA: true,
    maxItems: 15,
  },
  {
    id: 'conservative',
    name: 'Conservative — Quality + Overlap',
    description: 'Lower volatility names with celebrity overlap and neutral RSI',
    minChangePct: -2,
    maxChangePct: 5,
    minVolumeRatio: 0.8,
    minMarketCap: 2_000_000_000,
    rsiMin: 35,
    rsiMax: 60,
    macdTrend: 'any',
    momentumTiers: ['neutral', 'building'],
    minCompositeScore: 8,
    minCelebrityScore: 1,
    minMomentumScore: -2,
    aiRecommendations: ['buy', 'hold'],
    requireAbove50DayMA: false,
    maxItems: 15,
  },
  {
    id: 'oversold-bounce',
    name: 'Oversold Bounce Watch',
    description: 'RSI recovery zone with improving MACD from oversold',
    minChangePct: -5,
    maxChangePct: 3,
    minVolumeRatio: 1.0,
    minMarketCap: 500_000_000,
    rsiMin: 28,
    rsiMax: 42,
    macdTrend: 'any',
    momentumTiers: ['neutral', 'weak', 'building'],
    minCompositeScore: 5,
    minCelebrityScore: 0,
    minMomentumScore: -5,
    aiRecommendations: ['buy', 'hold'],
    requireAbove50DayMA: false,
    maxItems: 12,
  },
];

const DEFAULT_SETTINGS = {
  activePresetId: 'recommended',
  customCriteria: { ...RECOMMENDED_CRITERIA, id: 'custom', name: 'My Custom Watchlist' },
  pinnedSymbols: [],
  excludedSymbols: [],
  updatedAt: null,
};

function ensureDir() {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadWatchlistSettings() {
  ensureDir();
  if (!fs.existsSync(SETTINGS_FILE)) return { ...DEFAULT_SETTINGS };
  try {
    const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    return { ...DEFAULT_SETTINGS, ...data };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveWatchlistSettings(settings) {
  ensureDir();
  settings.updatedAt = new Date().toISOString();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  return settings;
}

function getActiveCriteria(settings) {
  if (settings.activePresetId === 'custom') {
    return { ...RECOMMENDED_CRITERIA, ...settings.customCriteria, id: 'custom' };
  }
  const preset = PRESETS.find((p) => p.id === settings.activePresetId);
  return preset ?? RECOMMENDED_CRITERIA;
}

function passesFastFilters(stock, criteria, excluded) {
  if (excluded.has(stock.symbol)) return false;
  if (stock.changePercentage < criteria.minChangePct) return false;
  if (stock.changePercentage > criteria.maxChangePct) return false;
  if ((stock.momentumSignals?.volumeRatio ?? 0) < criteria.minVolumeRatio) return false;
  if ((stock.marketCap ?? 0) < criteria.minMarketCap) return false;
  if (!criteria.momentumTiers.includes(stock.momentumTier)) return false;
  if (stock.compositeScore < criteria.minCompositeScore) return false;
  if (stock.celebrityScore < criteria.minCelebrityScore) return false;
  if (stock.momentumScore < criteria.minMomentumScore) return false;
  if (!criteria.aiRecommendations.includes(stock.aiRecommendation)) return false;
  if (criteria.requireAbove50DayMA && (stock.momentumSignals?.above50DayMA ?? 0) <= 0) {
    return false;
  }
  return true;
}

function buildMatchReasons(stock, indicators, criteria) {
  const reasons = [];
  const vol = stock.momentumSignals?.volumeRatio ?? 0;

  reasons.push({
    key: 'change',
    label: `${stock.changePercentage >= 0 ? '+' : ''}${stock.changePercentage.toFixed(2)}% today`,
    ok: stock.changePercentage >= criteria.minChangePct && stock.changePercentage <= criteria.maxChangePct,
  });
  reasons.push({
    key: 'volume',
    label: `Volume ${vol.toFixed(2)}× avg`,
    ok: vol >= criteria.minVolumeRatio,
  });
  if (indicators.rsi != null) {
    reasons.push({
      key: 'rsi',
      label: `RSI ${indicators.rsi}`,
      ok: indicators.rsi >= criteria.rsiMin && indicators.rsi <= criteria.rsiMax,
    });
  }
  if (indicators.macdTrend) {
    const macdOk =
      criteria.macdTrend === 'any' || indicators.macdTrend === criteria.macdTrend;
    reasons.push({
      key: 'macd',
      label: `MACD ${indicators.macdTrend}`,
      ok: macdOk,
    });
  }
  if (stock.momentumTier) {
    reasons.push({
      key: 'momentum',
      label: `${stock.momentumTier} momentum (${stock.momentumScore})`,
      ok: criteria.momentumTiers.includes(stock.momentumTier),
    });
  }
  if (stock.celebrityScore > 0) {
    reasons.push({
      key: 'celebrity',
      label: `${stock.celebrityScore} celebrity holder(s)`,
      ok: stock.celebrityScore >= criteria.minCelebrityScore,
    });
  }
  return reasons;
}

function watchlistScore(stock, indicators, reasons) {
  let score = stock.compositeScore ?? 0;
  if (indicators.macdTrend === 'bullish') score += 2;
  if (indicators.rsi >= 45 && indicators.rsi <= 60) score += 1.5;
  if ((stock.momentumSignals?.volumeRatio ?? 0) >= 1.5) score += 1.5;
  if (stock.isTopPick) score += 2;
  if (stock.signalSources?.includes('media-radar')) score += 1.5;
  if (stock.signalSources?.includes('strategy')) score += 1.5;
  const okCount = reasons.filter((r) => r.ok).length;
  score += okCount * 0.5;
  return Math.round(score * 10) / 10;
}

async function getIndicatorsForSymbol(symbol) {
  try {
    const { candles } = await getCandles(symbol, '1Y');
    if (candles.length < 30) return { rsi: null, macdTrend: 'insufficient' };
    const closes = candles.map((c) => c.close);
    const rsi = computeRSI(closes);
    const macd = computeMACD(closes);
    return { rsi, macdTrend: macd.trend, macd: macd.macd, macdSignal: macd.signal };
  } catch {
    return { rsi: null, macdTrend: 'unknown' };
  }
}

export async function buildWatchlist(settingsOverride = null) {
  const settings = settingsOverride ?? loadWatchlistSettings();
  const criteria = getActiveCriteria(settings);
  const excluded = new Set(settings.excludedSymbols ?? []);
  const pinned = new Set(settings.pinnedSymbols ?? []);

  const base = await getScreenerData();
  const stocks = base.stocks ?? [];
  const [strategies, media] = await Promise.all([
    getStrategies(stocks, false),
    Promise.resolve(getMediaRadarSnapshot(stocks)),
  ]);
  const merged = mergeSignalsIntoScreener(base, strategies, media).stocks ?? stocks;

  const candidates = merged
    .filter((s) => passesFastFilters(s, criteria, excluded) || pinned.has(s.symbol))
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 50);

  const pinnedStocks = merged.filter((s) => pinned.has(s.symbol) && !excluded.has(s.symbol));
  const toAnalyze = [...new Map([...pinnedStocks, ...candidates].map((s) => [s.symbol, s])).values()];

  const items = [];
  for (const stock of toAnalyze) {
    const indicators = await getIndicatorsForSymbol(stock.symbol);
    const isPinned = pinned.has(stock.symbol);

    let passes = isPinned || passesFastFilters(stock, criteria, excluded);
    if (passes && indicators.rsi != null) {
      if (indicators.rsi < criteria.rsiMin || indicators.rsi > criteria.rsiMax) {
        passes = isPinned;
      }
    }
    if (
      passes &&
      criteria.macdTrend !== 'any' &&
      indicators.macdTrend !== 'insufficient' &&
      indicators.macdTrend !== 'unknown'
    ) {
      if (indicators.macdTrend !== criteria.macdTrend) passes = isPinned;
    }

    if (!passes) continue;

    const reasons = buildMatchReasons(stock, indicators, criteria);
    items.push({
      symbol: stock.symbol,
      name: stock.name,
      price: stock.price,
      changePercentage: stock.changePercentage,
      volume: stock.volume,
      marketCap: stock.marketCap,
      sector: stock.sector,
      momentumTier: stock.momentumTier,
      momentumScore: stock.momentumScore,
      compositeScore: stock.compositeScore,
      volumeRatio: stock.momentumSignals?.volumeRatio ?? 0,
      rsi: indicators.rsi,
      macdTrend: indicators.macdTrend,
      macd: indicators.macd,
      macdSignal: indicators.macdSignal,
      isPinned,
      isTopPick: stock.isTopPick,
      signalSources: stock.signalSources ?? [],
      watchlistScore: watchlistScore(stock, indicators, reasons),
      matchReasons: reasons,
    });
  }

  items.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return b.watchlistScore - a.watchlistScore;
  });

  return {
    items: items.slice(0, criteria.maxItems ?? 20),
    criteria,
    settings: {
      activePresetId: settings.activePresetId,
      pinnedSymbols: settings.pinnedSymbols ?? [],
      excludedSymbols: settings.excludedSymbols ?? [],
      customCriteria: settings.customCriteria,
      updatedAt: settings.updatedAt,
    },
    presets: PRESETS,
    generatedAt: new Date().toISOString(),
  };
}

export function updateWatchlistSettings(partial) {
  const current = loadWatchlistSettings();
  const next = {
    ...current,
    ...partial,
    customCriteria: partial.customCriteria
      ? { ...current.customCriteria, ...partial.customCriteria }
      : current.customCriteria,
    pinnedSymbols: partial.pinnedSymbols ?? current.pinnedSymbols,
    excludedSymbols: partial.excludedSymbols ?? current.excludedSymbols,
  };
  return saveWatchlistSettings(next);
}

export function pinSymbol(symbol) {
  const settings = loadWatchlistSettings();
  const sym = symbol.toUpperCase();
  if (!settings.pinnedSymbols.includes(sym)) {
    settings.pinnedSymbols = [...settings.pinnedSymbols, sym];
  }
  settings.excludedSymbols = settings.excludedSymbols.filter((s) => s !== sym);
  return saveWatchlistSettings(settings);
}

export function unpinSymbol(symbol) {
  const settings = loadWatchlistSettings();
  settings.pinnedSymbols = settings.pinnedSymbols.filter((s) => s !== symbol.toUpperCase());
  return saveWatchlistSettings(settings);
}

export function excludeSymbol(symbol) {
  const settings = loadWatchlistSettings();
  const sym = symbol.toUpperCase();
  if (!settings.excludedSymbols.includes(sym)) {
    settings.excludedSymbols = [...settings.excludedSymbols, sym];
  }
  settings.pinnedSymbols = settings.pinnedSymbols.filter((s) => s !== sym);
  return saveWatchlistSettings(settings);
}
