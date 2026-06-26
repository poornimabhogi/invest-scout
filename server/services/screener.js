import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  fetchFinnhubQuotes,
  mapFinnhubToQuote,
  generateSeedQuotes,
  getApiKey,
} from './marketProvider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, '..', 'data', 'screener-cache.json');
const CACHE_TTL_MS = 15 * 60 * 1000;

let cache = {
  stocks: null,
  topPicks: null,
  momentumLeaders: null,
  celebrityPicks: null,
  celebrities: null,
  lastUpdated: null,
  isRefreshing: false,
  dataSource: 'seed',
};

function loadJson(filename) {
  const filePath = path.join(__dirname, '..', 'data', filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildCelebrityIndex() {
  const data = loadJson('celebrity-portfolios.json');
  const bySymbol = new Map();

  for (const investor of data.investors) {
    for (const symbol of investor.holdings) {
      if (!bySymbol.has(symbol)) {
        bySymbol.set(symbol, []);
      }
      bySymbol.get(symbol).push({
        id: investor.id,
        name: investor.name,
        firm: investor.firm,
      });
    }
  }

  return { investors: data.investors, bySymbol };
}

function calculateMomentumScore(quote) {
  const change1d = quote.regularMarketChangePercent ?? 0;
  const change52w = quote.fiftyTwoWeekChangePercent ?? 0;
  const price = quote.regularMarketPrice ?? 0;
  const ma50 = quote.fiftyDayAverage ?? price;
  const ma200 = quote.twoHundredDayAverage ?? price;
  const above50 = ma50 ? ((price - ma50) / ma50) * 100 : 0;
  const above200 = ma200 ? ((price - ma200) / ma200) * 100 : 0;
  const avgVol = quote.averageDailyVolume3Month ?? quote.regularMarketVolume ?? 1;
  const volRatio = quote.regularMarketVolume ? quote.regularMarketVolume / avgVol : 1;

  const raw =
    change1d * 0.3 +
    change52w * 0.25 +
    above50 * 0.2 +
    above200 * 0.15 +
    (volRatio - 1) * 10 * 0.1;

  let tier = 'neutral';
  if (raw >= 8) tier = 'strong';
  else if (raw >= 3) tier = 'building';
  else if (raw <= -5) tier = 'weak';

  return {
    score: Math.round(raw * 10) / 10,
    tier,
    signals: {
      change1d: Math.round(change1d * 100) / 100,
      change52w: Math.round(change52w * 100) / 100,
      above50DayMA: Math.round(above50 * 100) / 100,
      above200DayMA: Math.round(above200 * 100) / 100,
      volumeRatio: Math.round(volRatio * 100) / 100,
    },
  };
}

function calculateCelebrityScore(symbol, celebrityIndex) {
  const holders = celebrityIndex.bySymbol.get(symbol) ?? [];
  return { score: holders.length, holders };
}

function calculateRecommendation(momentumScore, celebrityScore, change1d) {
  const composite = momentumScore * 0.55 + celebrityScore * 8 * 0.45;
  if (composite >= 6 && change1d >= 0) return 'buy';
  if (composite <= -2 || change1d <= -4) return 'sell';
  return 'hold';
}

function calculateRiskLevel(momentumScore, volRatio) {
  const absMomentum = Math.abs(momentumScore);
  if (absMomentum >= 10 || volRatio >= 2) return 'high';
  if (absMomentum >= 4 || volRatio >= 1.5) return 'medium';
  return 'low';
}

function mapQuoteToStock(quote, celebrityIndex) {
  const symbol = quote.symbol;
  const momentum = calculateMomentumScore(quote);
  const celebrity = calculateCelebrityScore(symbol, celebrityIndex);
  const compositeScore =
    Math.round((momentum.score * 0.6 + celebrity.score * 12 * 0.4) * 10) / 10;

  const market =
    ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'AMD', 'INTC', 'NFLX'].includes(symbol)
      ? 'NASDAQ'
      : ['JPM', 'BAC', 'WMT', 'HD', 'DIS', 'JNJ', 'XOM', 'CVX', 'PG', 'KO'].includes(symbol)
        ? 'NYSE'
        : 'OTHER';

  return {
    symbol,
    name: quote.shortName || quote.longName || symbol,
    price: quote.regularMarketPrice ?? 0,
    change: quote.regularMarketChange ?? 0,
    changePercentage: quote.regularMarketChangePercent ?? 0,
    marketCap: quote.marketCap ?? 0,
    volume: quote.regularMarketVolume ?? 0,
    market,
    sector: quote.sector || 'Unknown',
    riskLevel: calculateRiskLevel(momentum.score, momentum.signals.volumeRatio),
    aiRecommendation: calculateRecommendation(
      momentum.score,
      celebrity.score,
      momentum.signals.change1d
    ),
    aiConfidenceScore: clamp(0.5 + compositeScore / 20, 0.4, 0.98),
    momentumScore: momentum.score,
    momentumTier: momentum.tier,
    momentumSignals: momentum.signals,
    celebrityScore: celebrity.score,
    celebrityHolders: celebrity.holders,
    compositeScore,
    isTopPick: false,
  };
}

function buildRankedResults(stocks, celebrityIndex, dataSource) {
  stocks.sort((a, b) => b.compositeScore - a.compositeScore);

  const topPicks = stocks
    .filter((s) => s.celebrityScore >= 1 && s.momentumTier !== 'weak')
    .slice(0, 15);
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
    stocks,
    topPicks,
    momentumLeaders,
    celebrityPicks,
    celebrities: celebrityIndex.investors,
    lastUpdated: new Date().toISOString(),
    isRefreshing: false,
    dataSource,
  };
}

function saveDiskCache(data) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('Failed to save screener cache:', err.message);
  }
}

function loadDiskCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      return { ...data, isRefreshing: false };
    }
  } catch (err) {
    console.warn('Failed to load screener cache:', err.message);
  }
  return null;
}

async function runScreener() {
  const universe = loadJson('universe.json');
  const celebrityIndex = buildCelebrityIndex();
  const uniqueSymbols = [...new Set(universe)];
  const apiKey = getApiKey();

  console.log(`Screening ${uniqueSymbols.length} stocks...`);

  let quotes;
  let dataSource;

  if (apiKey) {
    console.log('Using Finnhub live market data');
    const finnhubData = await fetchFinnhubQuotes(uniqueSymbols, apiKey, (done, total) => {
      process.stdout.write(`\rFinnhub: ${done}/${total} quotes fetched...`);
    });
    console.log('');
    quotes = finnhubData.map((d) => mapFinnhubToQuote(d.symbol, d));
    dataSource = 'finnhub';
  } else {
    console.log('No FINNHUB_API_KEY — using seed data (add key to .env for live quotes)');
    quotes = generateSeedQuotes(uniqueSymbols);
    dataSource = 'seed';
  }

  if (quotes.length < 10) {
    const diskCache = loadDiskCache();
    if (diskCache?.stocks?.length) {
      console.warn(`Only ${quotes.length} quotes — using cached screener data`);
      return diskCache;
    }
    throw new Error(`Insufficient market data (${quotes.length} quotes)`);
  }

  const stocks = quotes.map((q) => mapQuoteToStock(q, celebrityIndex));
  const result = buildRankedResults(stocks, celebrityIndex, dataSource);
  saveDiskCache(result);
  return result;
}

function runSeedScreener() {
  const universe = loadJson('universe.json');
  const celebrityIndex = buildCelebrityIndex();
  const uniqueSymbols = [...new Set(universe)];
  const quotes = generateSeedQuotes(uniqueSymbols);
  const stocks = quotes.map((q) => mapQuoteToStock(q, celebrityIndex));
  return buildRankedResults(stocks, celebrityIndex, 'seed');
}

function ensureBootstrapCache() {
  if (cache.stocks?.length) return cache;

  const diskCache = loadDiskCache();
  if (diskCache?.stocks?.length) {
    cache = { ...diskCache, isRefreshing: false };
    return cache;
  }

  cache = runSeedScreener();
  saveDiskCache(cache);
  return cache;
}

function isCacheStale() {
  return (
    !cache.lastUpdated || Date.now() - new Date(cache.lastUpdated).getTime() > CACHE_TTL_MS
  );
}

function startBackgroundRefresh() {
  if (cache.isRefreshing) return;

  cache.isRefreshing = true;
  runScreener()
    .then((result) => {
      cache = { ...result, isRefreshing: false };
      console.log(`Background refresh complete: ${result.stocks.length} stocks (${result.dataSource})`);
    })
    .catch((err) => {
      cache.isRefreshing = false;
      console.error('Background refresh failed:', err.message);
    });
}

export async function getScreenerData(forceRefresh = false) {
  ensureBootstrapCache();

  if (forceRefresh) {
    if (cache.isRefreshing) {
      while (cache.isRefreshing) {
        await new Promise((r) => setTimeout(r, 500));
      }
      return cache;
    }
    cache.isRefreshing = true;
    try {
      const result = await runScreener();
      cache = { ...result, isRefreshing: false };
      return cache;
    } catch (err) {
      cache.isRefreshing = false;
      throw err;
    }
  }

  if (isCacheStale() || (getApiKey() && cache.dataSource === 'seed')) {
    startBackgroundRefresh();
  }

  return cache;
}

export function getCacheStatus() {
  return {
    lastUpdated: cache.lastUpdated,
    stockCount: cache.stocks?.length ?? 0,
    isRefreshing: cache.isRefreshing,
    cacheTtlMinutes: CACHE_TTL_MS / 60000,
    dataSource: cache.dataSource ?? 'unknown',
    hasLiveApiKey: Boolean(getApiKey()),
  };
}
