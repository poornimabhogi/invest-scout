import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'data', 'candle-cache');
const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart';

const RANGE_CONFIG = {
  '1D': { interval: '5m', range: '1d' },
  '1W': { interval: '30m', range: '5d' },
  '1M': { interval: '1d', range: '1mo' },
  '3M': { interval: '1d', range: '3mo' },
  '1Y': { interval: '1d', range: '1y' },
  '5Y': { interval: '1wk', range: '5y' },
  MAX: { interval: '1mo', range: 'max' },
};

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function hashSymbol(symbol) {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return h;
}

/** Last-resort synthetic data — only used when Yahoo is unreachable */
function generateSeedCandles(symbol, count = 252, anchorPrice = null) {
  const h = hashSymbol(symbol);
  const candles = [];
  let price = anchorPrice ?? 20 + (h % 400);
  const now = Math.floor(Date.now() / 1000);
  const daySec = 86400;

  for (let i = count; i >= 0; i--) {
    const drift = Math.sin((i + h) / 15) * 0.02 + ((h % 7) - 3) * 0.001;
    const open = price;
    price = Math.max(1, price * (1 + drift + ((i * h) % 5 - 2) * 0.003));
    candles.push({
      time: now - i * daySec,
      open: Math.round(open * 100) / 100,
      high: Math.round(Math.max(open, price) * 100) / 100,
      low: Math.round(Math.min(open, price) * 100) / 100,
      close: Math.round(price * 100) / 100,
      volume: 1e6 + (h % 20) * 1e5,
    });
  }
  return candles;
}

async function fetchYahooCandles(symbol, rangeKey) {
  const config = RANGE_CONFIG[rangeKey] ?? RANGE_CONFIG['1Y'];
  const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=${config.interval}&range=${config.range}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InvestScout/1.0)' },
  });
  if (!res.ok) throw new Error(`Yahoo chart ${res.status}`);

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result?.timestamp?.length) throw new Error('No Yahoo chart data');

  const q = result.indicators?.quote?.[0];
  if (!q) throw new Error('No Yahoo quote indicators');

  const candles = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const close = q.close?.[i];
    if (close == null || Number.isNaN(close)) continue;
    candles.push({
      time: result.timestamp[i],
      open: q.open?.[i] ?? close,
      high: q.high?.[i] ?? close,
      low: q.low?.[i] ?? close,
      close,
      volume: q.volume?.[i] ?? 0,
    });
  }

  if (candles.length < 2) throw new Error('Insufficient Yahoo candles');
  return candles;
}

function getCacheKey(symbol, range) {
  return `${symbol}_${range}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function readCache(symbol, range) {
  ensureCacheDir();
  const file = path.join(CACHE_DIR, `${getCacheKey(symbol, range)}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    // Ignore legacy/synthetic cache entries
    if (!data.source || data.source === 'seed') return null;
    if (Date.now() - data.cachedAt < 15 * 60 * 1000) {
      return { candles: data.candles, source: data.source ?? 'cache' };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeCache(symbol, range, candles, source) {
  ensureCacheDir();
  const file = path.join(CACHE_DIR, `${getCacheKey(symbol, range)}.json`);
  fs.writeFileSync(file, JSON.stringify({ cachedAt: Date.now(), candles, source }, null, 2));
}

export async function getCandles(symbol, range = '1Y') {
  const sym = symbol.toUpperCase();
  const cached = readCache(sym, range);
  if (cached) return cached;

  try {
    const candles = await fetchYahooCandles(sym, range);
    writeCache(sym, range, candles, 'yahoo');
    return { candles, source: 'yahoo' };
  } catch (err) {
    console.warn(`Yahoo candle fetch failed for ${sym} (${range}):`, err.message);
  }

  const count =
    range === 'MAX' ? 240 : range === '5Y' ? 260 : range === '1Y' ? 252 : range === '1M' ? 30 : 90;
  const candles = generateSeedCandles(sym, count);
  console.warn(`Using synthetic chart data for ${sym} — charts may not match live price`);
  return { candles, source: 'seed' };
}

export function computePerformance(candles) {
  if (!candles.length) return { lifetime: 0, ytd: 0, oneYear: 0, fiveYear: 0 };
  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1];
  const first = closes[0];

  const lifetime = first > 0 ? ((last - first) / first) * 100 : 0;
  const oneYearIdx = Math.max(0, closes.length - 252);
  const oneYear =
    closes[oneYearIdx] > 0 ? ((last - closes[oneYearIdx]) / closes[oneYearIdx]) * 100 : lifetime;

  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
  const ytdCandle = candles.find((c) => c.time >= yearStart);
  const ytd =
    ytdCandle && ytdCandle.close > 0 ? ((last - ytdCandle.close) / ytdCandle.close) * 100 : oneYear;

  const fiveYearIdx = Math.max(0, closes.length - 252 * 5);
  const fiveYear =
    closes[fiveYearIdx] > 0 ? ((last - closes[fiveYearIdx]) / closes[fiveYearIdx]) * 100 : lifetime;

  return {
    lifetime: Math.round(lifetime * 100) / 100,
    ytd: Math.round(ytd * 100) / 100,
    oneYear: Math.round(oneYear * 100) / 100,
    fiveYear: Math.round(fiveYear * 100) / 100,
  };
}

export { RANGE_CONFIG };
