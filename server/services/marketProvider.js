import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const CALLS_PER_MINUTE = 55;

const SECTOR_MAP = {
  AAPL: 'Technology', MSFT: 'Technology', GOOGL: 'Technology', GOOG: 'Technology',
  AMZN: 'Consumer Cyclical', NVDA: 'Technology', META: 'Technology', TSLA: 'Automotive',
  JPM: 'Financial Services', BAC: 'Financial Services', V: 'Financial Services',
  MA: 'Financial Services', XOM: 'Energy', CVX: 'Energy', JNJ: 'Healthcare',
  UNH: 'Healthcare', WMT: 'Retail', HD: 'Retail', PG: 'Consumer Defensive',
  KO: 'Consumer Defensive', PEP: 'Consumer Defensive', DIS: 'Entertainment',
  NFLX: 'Entertainment', AMD: 'Technology', INTC: 'Technology', CRM: 'Technology',
  COIN: 'Financial Services', PLTR: 'Technology', SNOW: 'Technology',
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hashSymbol(symbol) {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return h;
}

async function finnhubFetch(path, apiKey) {
  const url = `${FINNHUB_BASE}${path}${path.includes('?') ? '&' : '?'}token=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub ${res.status}: ${path}`);
  return res.json();
}

export async function fetchFinnhubQuotes(symbols, apiKey, onProgress) {
  const quotes = [];
  const delayMs = Math.ceil(60000 / CALLS_PER_MINUTE);

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    try {
      const [quote, metric] = await Promise.all([
        finnhubFetch(`/quote?symbol=${symbol}`, apiKey),
        finnhubFetch(`/stock/metric?symbol=${symbol}&metric=all`, apiKey).catch(() => null),
      ]);

      if (quote?.c && quote.c > 0) {
        quotes.push({ symbol, quote, metric: metric?.metric ?? {} });
      }
    } catch (err) {
      console.warn(`Finnhub fetch failed for ${symbol}:`, err.message);
    }

    if (onProgress) onProgress(i + 1, symbols.length);
    if (i < symbols.length - 1) await sleep(delayMs);
  }

  return quotes;
}

function pickPeRatio(metric, price) {
  if (!metric || typeof metric !== 'object') return null;
  const candidates = [
    metric.peBasicExclExtraTTM,
    metric.peTTM,
    metric.peNormalizedAnnual,
    metric.peAnnual,
    metric.peExclExtraAnnual,
  ];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0 && n < 500) return Math.round(n * 100) / 100;
  }
  return null;
}

export function mapFinnhubToQuote(symbol, data) {
  const { quote, metric } = data;
  const price = quote.c;
  const change = quote.d ?? 0;
  const changePct = quote.dp ?? 0;
  const fiftyTwoWeekHigh = metric['52WeekHigh'] ?? price * 1.2;
  const fiftyTwoWeekLow = metric['52WeekLow'] ?? price * 0.8;
  const rangePosition =
    fiftyTwoWeekHigh > fiftyTwoWeekLow
      ? ((price - fiftyTwoWeekLow) / (fiftyTwoWeekHigh - fiftyTwoWeekLow)) * 100
      : 50;
  const change52w =
    fiftyTwoWeekLow > 0 ? ((price - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100 * 0.4 : 0;

  const peRatio = pickPeRatio(metric, price);

  return {
    symbol,
    shortName: symbol,
    longName: symbol,
    regularMarketPrice: price,
    regularMarketChange: change,
    regularMarketChangePercent: changePct,
    regularMarketVolume: metric['10DayAverageTradingVolume']
      ? metric['10DayAverageTradingVolume'] * 1e6
      : 1e6,
    averageDailyVolume3Month: metric['10DayAverageTradingVolume']
      ? metric['10DayAverageTradingVolume'] * 1e6
      : 1e6,
    marketCap: metric['marketCapitalization'] ? metric['marketCapitalization'] * 1e6 : 0,
    peRatio,
    fiftyDayAverage: price * (0.95 + rangePosition / 500),
    twoHundredDayAverage: price * (0.9 + rangePosition / 1000),
    fiftyTwoWeekChangePercent: change52w,
    sector: SECTOR_MAP[symbol] ?? 'Unknown',
    fullExchangeName: 'US',
    exchange: 'US',
  };
}

export function generateSeedQuotes(symbols) {
  return symbols.map((symbol) => {
    const h = hashSymbol(symbol);
    const price = 20 + (h % 480) + (h % 100) / 100;
    const changePct = ((h % 200) - 100) / 20;
    const change = (price * changePct) / 100;
    const volume = 1e6 + (h % 50) * 1e6;

    return {
      symbol,
      shortName: symbol,
      longName: symbol,
      regularMarketPrice: Math.round(price * 100) / 100,
      regularMarketChange: Math.round(change * 100) / 100,
      regularMarketChangePercent: Math.round(changePct * 100) / 100,
      regularMarketVolume: volume,
      averageDailyVolume3Month: volume * 0.85,
      marketCap: price * volume * 0.01,
      peRatio: Math.round((12 + (h % 40)) * 10) / 10,
      fiftyDayAverage: price * (0.97 + (h % 10) / 200),
      twoHundredDayAverage: price * (0.92 + (h % 10) / 150),
      fiftyTwoWeekChangePercent: ((h % 80) - 20),
      sector: SECTOR_MAP[symbol] ?? 'Unknown',
      fullExchangeName: 'US',
      exchange: 'US',
    };
  });
}

export function getApiKey() {
  return process.env.FINNHUB_API_KEY || '';
}
