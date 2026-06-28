import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getApiKey } from './marketProvider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const POLL_INTERVAL_MS = 45 * 1000;
const MENTION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MENTIONS = 200;

const FEEDS = [
  {
    id: 'cnbc-top',
    name: 'CNBC',
    type: 'tv',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114',
  },
  {
    id: 'cnbc-markets',
    name: 'CNBC Markets',
    type: 'tv',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
  },
  {
    id: 'cnbc-investing',
    name: 'CNBC Investing',
    type: 'tv',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069',
  },
  {
    id: 'bloomberg-markets',
    name: 'Bloomberg Markets',
    type: 'news',
    url: 'https://feeds.bloomberg.com/markets/news.rss',
  },
  {
    id: 'bloomberg-business',
    name: 'Bloomberg Business',
    type: 'news',
    url: 'https://feeds.bloomberg.com/business/news.rss',
  },
  {
    id: 'bloomberg-technology',
    name: 'Bloomberg Technology',
    type: 'news',
    url: 'https://feeds.bloomberg.com/technology/news.rss',
  },
  {
    id: 'bloomberg-economics',
    name: 'Bloomberg Economics',
    type: 'news',
    url: 'https://feeds.bloomberg.com/economics/news.rss',
  },
  {
    id: 'bloomberg-wealth',
    name: 'Bloomberg Wealth',
    type: 'news',
    url: 'https://feeds.bloomberg.com/wealth/news.rss',
  },
  {
    id: 'bloomberg-industries',
    name: 'Bloomberg Industries',
    type: 'news',
    url: 'https://feeds.bloomberg.com/industries/news.rss',
  },
  {
    id: 'bloomberg-politics',
    name: 'Bloomberg Politics',
    type: 'news',
    url: 'https://feeds.bloomberg.com/politics/news.rss',
  },
  {
    id: 'reuters-breaking',
    name: 'Reuters (1h)',
    type: 'news',
    url: 'https://news.google.com/rss/search?q=site:reuters.com+when:1h&hl=en-US&gl=US&ceid=US:en',
  },
  {
    id: 'reuters-markets',
    name: 'Reuters Markets',
    type: 'news',
    url: 'https://news.google.com/rss/search?q=site:reuters.com+markets+when:24h&hl=en-US&gl=US&ceid=US:en',
  },
  {
    id: 'reuters-business',
    name: 'Reuters Business',
    type: 'news',
    url: 'https://news.google.com/rss/search?q=site:reuters.com+business+when:24h&hl=en-US&gl=US&ceid=US:en',
  },
  {
    id: 'reuters-technology',
    name: 'Reuters Technology',
    type: 'news',
    url: 'https://news.google.com/rss/search?q=site:reuters.com+technology+when:24h&hl=en-US&gl=US&ceid=US:en',
  },
  {
    id: 'reuters-world',
    name: 'Reuters World',
    type: 'news',
    url: 'https://news.google.com/rss/search?q=site:reuters.com+world+when:24h&hl=en-US&gl=US&ceid=US:en',
  },
  {
    id: 'reddit-wsb',
    name: 'r/wallstreetbets',
    type: 'social',
    url: 'https://www.reddit.com/r/wallstreetbets/new/.rss',
  },
  {
    id: 'reddit-stocks',
    name: 'r/stocks',
    type: 'social',
    url: 'https://www.reddit.com/r/stocks/new/.rss',
  },
  {
    id: 'reddit-investing',
    name: 'r/investing',
    type: 'social',
    url: 'https://www.reddit.com/r/investing/new/.rss',
  },
  {
    id: 'reddit-stockmarket',
    name: 'r/StockMarket',
    type: 'social',
    url: 'https://www.reddit.com/r/StockMarket/new/.rss',
  },
  {
    id: 'google-breaking',
    name: 'Google News (1h)',
    type: 'news',
    url: 'https://news.google.com/rss/search?q=stock+market+OR+earnings+OR+NYSE+OR+NASDAQ+when:1h&hl=en-US&gl=US&ceid=US:en',
  },
];

const COMPANY_ALIASES = {
  apple: 'AAPL',
  microsoft: 'MSFT',
  google: 'GOOGL',
  alphabet: 'GOOGL',
  amazon: 'AMZN',
  'prime day': 'AMZN',
  nvidia: 'NVDA',
  meta: 'META',
  facebook: 'META',
  tesla: 'TSLA',
  netflix: 'NFLX',
  amd: 'AMD',
  intel: 'INTC',
  coinbase: 'COIN',
  palantir: 'PLTR',
  snowflake: 'SNOW',
  uber: 'UBER',
  airbnb: 'ABNB',
  roblox: 'RBLX',
  gamestop: 'GME',
  disney: 'DIS',
  boeing: 'BA',
  jpmorgan: 'JPM',
  'jp morgan': 'JPM',
  berkshire: 'BRK-B',
  'berkshire hathaway': 'BRK-B',
};

// Tickers that collide with common English words — require $ prefix or cashtag context
const AMBIGUOUS_SYMBOLS = new Set([
  'A', 'C', 'D', 'F', 'IT', 'L', 'MA', 'MO', 'ON', 'S', 'T', 'V', 'ALL', 'ARE', 'CAT',
  'ED', 'EL', 'ESS', 'FUN', 'HST', 'ICE', 'KEY', 'LOW', 'NOW', 'O', 'PAR', 'SO', 'TEAM',
  'UDR', 'WELL', 'BILL', 'HUB', 'PCTY',
]);

let universeSet = null;
let universeRegex = null;
let cashtagRegex = null;

let state = {
  mentions: [],
  seenKeys: new Set(),
  lastPollAt: null,
  isPolling: false,
  feedStatus: {},
  pollTimer: null,
  subscribers: new Set(),
};

function loadUniverse() {
  const filePath = path.join(__dirname, '..', 'data', 'universe.json');
  const symbols = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  universeSet = new Set(symbols.map((s) => s.toUpperCase()));

  const safeSymbols = symbols.filter((s) => !AMBIGUOUS_SYMBOLS.has(s.toUpperCase()));
  universeRegex = new RegExp(`\\b(${safeSymbols.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');

  const allForCashtag = symbols.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  cashtagRegex = new RegExp(`\\$(${allForCashtag})\\b`, 'gi');

  return symbols;
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
    .trim();
}

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 30) {
    const block = match[1];
    const title =
      decodeHtml(
        block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]
          ?? block.match(/<title>([\s\S]*?)<\/title>/)?.[1]
          ?? ''
      );
    const link =
      block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim()
      ?? block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1]?.trim()
      ?? '';
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? '';
    const description =
      decodeHtml(
        block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1]
          ?? block.match(/<description>([\s\S]*?)<\/description>/)?.[1]
          ?? ''
      ).replace(/<[^>]+>/g, ' ');

    if (title) {
      items.push({
        headline: title.replace(/\s+/g, ' ').slice(0, 300),
        excerpt: description.replace(/\s+/g, ' ').slice(0, 400),
        url: link,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      });
    }
  }
  return items;
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; InvestScout-MediaRadar/1.0)',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  return parseRssItems(xml);
}

async function fetchStocktwitsTrending() {
  const res = await fetch('https://api.stocktwits.com/api/2/trending/symbols.json', {
    headers: { 'User-Agent': 'InvestScout/1.0' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Stocktwits ${res.status}`);
  const data = await res.json();
  const symbols = data?.symbols ?? [];
  const now = new Date().toISOString();
  return symbols.slice(0, 20).map((s) => ({
    headline: `${s.symbol} trending on Stocktwits (${s.watchlist_count ?? '?'} watchers)`,
    excerpt: s.title ?? s.symbol,
    url: `https://stocktwits.com/symbol/${s.symbol}`,
    publishedAt: now,
    forcedSymbol: s.symbol?.toUpperCase(),
  }));
}

async function fetchFinnhubGeneralNews() {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const url = `${FINNHUB_BASE}/news?category=general&token=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) return [];

  const data = await res.json();
  return (data ?? []).slice(0, 25).map((n) => ({
    headline: n.headline,
    excerpt: n.summary?.slice(0, 300) ?? n.headline,
    url: n.url,
    publishedAt: new Date(n.datetime * 1000).toISOString(),
    sourceOverride: n.source,
    sourceType: 'tv',
  }));
}

function isSpuriousSymbolMatch(text, symbol, startIndex) {
  const after = text.slice(startIndex + symbol.length, startIndex + symbol.length + 4);
  if (symbol === 'U' && after.startsWith('.S')) return true;
  if (symbol === 'US' && after.startsWith('.') && !after.startsWith('.COM')) return true;
  return false;
}

function extractSymbols(text) {
  if (!universeSet) loadUniverse();
  const found = new Set();
  const upper = text.toUpperCase();

  let match;
  cashtagRegex.lastIndex = 0;
  while ((match = cashtagRegex.exec(upper)) !== null) {
    const sym = match[1].toUpperCase();
    if (universeSet.has(sym)) found.add(sym);
  }

  universeRegex.lastIndex = 0;
  while ((match = universeRegex.exec(upper)) !== null) {
    const sym = match[1].toUpperCase();
    if (!isSpuriousSymbolMatch(upper, sym, match.index)) found.add(sym);
  }

  const lower = text.toLowerCase();
  for (const [alias, symbol] of Object.entries(COMPANY_ALIASES)) {
    if (lower.includes(alias) && universeSet.has(symbol)) {
      found.add(symbol);
    }
  }

  for (const sym of AMBIGUOUS_SYMBOLS) {
    if (!found.has(sym)) continue;
    const cashtag = new RegExp(`\\$${sym}\\b`, 'i');
    if (!cashtag.test(text)) found.delete(sym);
  }

  return [...found];
}

function mentionKey(symbol, url, headline) {
  return `${symbol}|${url || headline.slice(0, 80).toLowerCase()}`;
}

function enrichMention(raw, feed, stockMap) {
  const text = `${raw.headline} ${raw.excerpt}`;
  let symbols = raw.forcedSymbol ? [raw.forcedSymbol] : extractSymbols(text);
  symbols = symbols.filter((s) => universeSet.has(s));
  if (symbols.length === 0) return [];

  const detectedAt = new Date().toISOString();
  return symbols.map((symbol) => {
    const stock = stockMap.get(symbol);
    const momentumTier = stock?.momentumTier ?? 'neutral';
    const momentumScore = stock?.momentumScore ?? 0;
    const isEarly = momentumTier === 'neutral' || momentumTier === 'building' || momentumTier === 'weak';

    return {
      id: `${symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      symbol,
      name: stock?.name ?? symbol,
      headline: raw.headline,
      excerpt: raw.excerpt,
      url: raw.url,
      source: raw.sourceOverride ?? feed.name,
      sourceType: raw.sourceType ?? feed.type,
      publishedAt: raw.publishedAt,
      detectedAt,
      price: stock?.price ?? 0,
      changePercentage: stock?.changePercentage ?? 0,
      momentumTier,
      momentumScore,
      isEarly,
    };
  });
}

function pruneOldMentions() {
  const cutoff = Date.now() - MENTION_TTL_MS;
  state.mentions = state.mentions.filter((m) => new Date(m.publishedAt).getTime() > cutoff);
  if (state.mentions.length > MAX_MENTIONS) {
    state.mentions = state.mentions.slice(0, MAX_MENTIONS);
  }
}

function notifySubscribers(payload) {
  for (const send of state.subscribers) {
    try {
      send(payload);
    } catch {
      state.subscribers.delete(send);
    }
  }
}

function buildEarlyHits(mentions) {
  const bySymbol = new Map();
  for (const m of mentions) {
    if (!m.isEarly) continue;
    const existing = bySymbol.get(m.symbol);
    if (!existing || new Date(m.publishedAt) > new Date(existing.publishedAt)) {
      bySymbol.set(m.symbol, {
        ...m,
        mentionCount24h: mentions.filter((x) => x.symbol === m.symbol).length,
      });
    }
  }
  return [...bySymbol.values()].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export function getMediaRadarSnapshot(stocks = []) {
  const stockMap = new Map(stocks.map((s) => [s.symbol, s]));
  const earlyHits = buildEarlyHits(state.mentions).map((hit) => {
    const stock = stockMap.get(hit.symbol);
    if (!stock) return hit;
    return {
      ...hit,
      name: stock.name,
      price: stock.price,
      changePercentage: stock.changePercentage,
      momentumTier: stock.momentumTier,
      momentumScore: stock.momentumScore,
      isEarly: stock.momentumTier !== 'strong',
    };
  });

  return {
    mentions: state.mentions,
    earlyHits,
    status: {
      isMonitoring: Boolean(state.pollTimer),
      lastPollAt: state.lastPollAt,
      pollIntervalSeconds: POLL_INTERVAL_MS / 1000,
      feedsTotal: FEEDS.length + 2,
      feedsActive: Object.values(state.feedStatus).filter((f) => f.ok).length,
      feedStatus: state.feedStatus,
      mentionCount: state.mentions.length,
      earlyCount: earlyHits.length,
    },
  };
}

export function subscribeMediaRadar(callback) {
  state.subscribers.add(callback);
  return () => state.subscribers.delete(callback);
}

async function pollFeeds(getStocks) {
  if (state.isPolling) return;
  state.isPolling = true;

  const newMentions = [];
  let stocks = [];
  try {
    stocks = (await getStocks()) ?? [];
  } catch {
    stocks = [];
  }
  const stockMap = new Map(stocks.map((s) => [s.symbol, s]));

  for (const feed of FEEDS) {
    try {
      const items = await fetchFeed(feed);
      state.feedStatus[feed.id] = { ok: true, count: items.length, at: new Date().toISOString() };
      for (const item of items) {
        const enriched = enrichMention(item, feed, stockMap);
        for (const m of enriched) {
          const key = mentionKey(m.symbol, m.url, m.headline);
          if (!state.seenKeys.has(key)) {
            state.seenKeys.add(key);
            newMentions.push(m);
          }
        }
      }
    } catch (err) {
      state.feedStatus[feed.id] = { ok: false, error: err.message, at: new Date().toISOString() };
    }
  }

  try {
    const trending = await fetchStocktwitsTrending();
    state.feedStatus.stocktwits = { ok: true, count: trending.length, at: new Date().toISOString() };
    for (const item of trending) {
      const enriched = enrichMention(item, { name: 'Stocktwits', type: 'social' }, stockMap);
      for (const m of enriched) {
        const key = mentionKey(m.symbol, m.url, m.headline);
        if (!state.seenKeys.has(key)) {
          state.seenKeys.add(key);
          newMentions.push(m);
        }
      }
    }
  } catch (err) {
    state.feedStatus.stocktwits = { ok: false, error: err.message, at: new Date().toISOString() };
  }

  try {
    const finnhubItems = await fetchFinnhubGeneralNews();
    state.feedStatus.finnhub = { ok: true, count: finnhubItems.length, at: new Date().toISOString() };
    for (const item of finnhubItems) {
      const enriched = enrichMention(
        item,
        { name: item.sourceOverride ?? 'Finnhub', type: 'tv' },
        stockMap
      );
      for (const m of enriched) {
        const key = mentionKey(m.symbol, m.url, m.headline);
        if (!state.seenKeys.has(key)) {
          state.seenKeys.add(key);
          newMentions.push(m);
        }
      }
    }
  } catch (err) {
    state.feedStatus.finnhub = { ok: false, error: err.message, at: new Date().toISOString() };
  }

  if (newMentions.length > 0) {
    newMentions.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    state.mentions = [...newMentions, ...state.mentions];
    pruneOldMentions();
    notifySubscribers(getMediaRadarSnapshot(stocks));
  }

  state.lastPollAt = new Date().toISOString();
  state.isPolling = false;
}

export function startMediaRadarMonitor(getStocks) {
  if (state.pollTimer) return;
  loadUniverse();
  console.log(`Media Radar: monitoring ${FEEDS.length + 2} TV/social feeds every ${POLL_INTERVAL_MS / 1000}s`);

  pollFeeds(getStocks).catch((err) => console.warn('Media Radar initial poll failed:', err.message));

  state.pollTimer = setInterval(() => {
    pollFeeds(getStocks).catch((err) => console.warn('Media Radar poll failed:', err.message));
  }, POLL_INTERVAL_MS);
}

export async function forceMediaRadarPoll(getStocks) {
  await pollFeeds(getStocks);
  return getMediaRadarSnapshot(await getStocks());
}
