import { getApiKey } from './marketProvider.js';

const CACHE_TTL_MS = 30_000;
const cache = new Map();

async function finnhubQuote(symbol, apiKey) {
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Finnhub ${res.status}`);
  const q = await res.json();
  return q?.c > 0 ? q.c : null;
}

async function yahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InvestScout/1.0)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  if (meta?.regularMarketPrice > 0) return meta.regularMarketPrice;
  if (meta?.previousClose > 0) return meta.previousClose;
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const last = closes.filter((c) => c != null).at(-1);
  return last > 0 ? last : null;
}

async function fetchLivePriceUncached(symbol) {
  const sym = symbol.toUpperCase();
  const apiKey = getApiKey();

  if (apiKey) {
    try {
      const price = await finnhubQuote(sym, apiKey);
      if (price) return { price, source: 'finnhub' };
    } catch (err) {
      console.warn(`Finnhub live quote failed for ${sym}:`, err.message);
    }
  }

  try {
    const price = await yahooQuote(sym);
    if (price) return { price, source: 'yahoo' };
  } catch (err) {
    console.warn(`Yahoo live quote failed for ${sym}:`, err.message);
  }

  return null;
}

export async function fetchLivePrice(symbol) {
  const sym = symbol.toUpperCase();
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.price;
  }

  const result = await fetchLivePriceUncached(sym);
  if (result?.price > 0) {
    cache.set(sym, { price: result.price, source: result.source, at: Date.now() });
    return result.price;
  }
  return null;
}

export async function fetchLivePrices(symbols) {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (sym) => {
      const price = await fetchLivePrice(sym);
      return price > 0 ? [sym, price] : null;
    })
  );
  return Object.fromEntries(entries.filter(Boolean));
}

export function getLivePriceCacheMeta(symbol) {
  const hit = cache.get(symbol.toUpperCase());
  if (!hit) return null;
  return { source: hit.source, cachedAt: new Date(hit.at).toISOString() };
}
