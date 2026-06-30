import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getApiKey } from './marketProvider.js';
import { enrichItemWithTranscript, resetTranscriptPollBudget } from './videoTranscripts.js';

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
  {
    id: 'tipranks-latest',
    name: 'TipRanks',
    type: 'news',
    url: 'https://news.google.com/rss/search?q=site:tipranks.com+when:24h&hl=en-US&gl=US&ceid=US:en',
  },
  {
    id: 'tipranks-breaking',
    name: 'TipRanks (1h)',
    type: 'news',
    url: 'https://news.google.com/rss/search?q=site:tipranks.com+when:1h&hl=en-US&gl=US&ceid=US:en',
  },
  {
    id: 'tipranks-analyst',
    name: 'TipRanks Analyst',
    type: 'news',
    url: 'https://news.google.com/rss/search?q=site:tipranks.com+analyst+OR+%22price+target%22+when:24h&hl=en-US&gl=US&ceid=US:en',
  },
  // Trump / policy & markets
  {
    id: 'google-trump-markets',
    name: 'Trump & Markets',
    type: 'news',
    url: 'https://news.google.com/rss/search?q=Trump+OR+%22President+Trump%22+stock+market+OR+tariff+OR+trade+when:24h&hl=en-US&gl=US&ceid=US:en',
    tags: ['trump'],
  },
  {
    id: 'google-trump-tech',
    name: 'Trump Tech Policy',
    type: 'news',
    url: 'https://news.google.com/rss/search?q=Trump+technology+OR+AI+OR+chips+OR+semiconductor+OR+Tesla+when:24h&hl=en-US&gl=US&ceid=US:en',
    tags: ['trump', 'tech-policy'],
  },
  {
    id: 'google-white-house-economy',
    name: 'White House / Economy',
    type: 'news',
    url: 'https://news.google.com/rss/search?q=White+House+OR+%22executive+order%22+economy+OR+market+OR+stocks+when:24h&hl=en-US&gl=US&ceid=US:en',
    tags: ['trump', 'policy'],
  },
  // X (Twitter) via Google News — no API key required
  {
    id: 'x-trump',
    name: 'X — Trump',
    type: 'social',
    url: 'https://news.google.com/rss/search?q=site:x.com+Trump+stock+OR+market+OR+tariff+when:24h&hl=en-US&gl=US&ceid=US:en',
    tags: ['trump', 'x-social'],
  },
  {
    id: 'x-musk',
    name: 'X — Musk / Tesla',
    type: 'social',
    url: 'https://news.google.com/rss/search?q=site:x.com+(Musk+OR+elonmusk)+Tesla+OR+stock+OR+invest+when:24h&hl=en-US&gl=US&ceid=US:en',
    tags: ['musk', 'x-social'],
  },
  {
    id: 'x-tech-ceos',
    name: 'X — Tech CEOs',
    type: 'social',
    url: 'https://news.google.com/rss/search?q=site:x.com+(Zuckerberg+OR+Bezos+OR+Cook+OR+Nadella+OR+Huang+OR+Pichai)+stock+OR+invest+when:24h&hl=en-US&gl=US&ceid=US:en',
    tags: ['tech-ceo', 'x-social'],
  },
  // Video — YouTube announcements (transcripts fetched when possible)
  {
    id: 'youtube-trump-market',
    name: 'YouTube — Trump / Markets',
    type: 'tv',
    url: 'https://news.google.com/rss/search?q=site:youtube.com+Trump+stock+market+OR+tariff+when:24h&hl=en-US&gl=US&ceid=US:en',
    tags: ['trump', 'video'],
    contentType: 'video',
  },
  {
    id: 'youtube-tech-invest',
    name: 'YouTube — Tech Investment',
    type: 'tv',
    url: 'https://news.google.com/rss/search?q=site:youtube.com+(Musk+OR+Buffett+OR+CNBC+OR+Apple+OR+Microsoft+OR+Nvidia)+invest+OR+announcement+when:24h&hl=en-US&gl=US&ceid=US:en',
    tags: ['tech-ceo', 'video'],
    contentType: 'video',
  },
  {
    id: 'youtube-earnings-calls',
    name: 'YouTube — Earnings / CEO',
    type: 'tv',
    url: 'https://news.google.com/rss/search?q=site:youtube.com+CEO+earnings+OR+%22investment+announcement%22+when:24h&hl=en-US&gl=US&ceid=US:en',
    tags: ['tech-ceo', 'video'],
    contentType: 'video',
  },
  // Top tech company investment / capex
  {
    id: 'google-tech-capex',
    name: 'Tech CapEx / Investment',
    type: 'news',
    url: 'https://news.google.com/rss/search?q=(Microsoft+OR+Amazon+OR+Google+OR+Meta+OR+Apple+OR+Nvidia)+invest+OR+billion+OR+%22data+center%22+when:24h&hl=en-US&gl=US&ceid=US:en',
    tags: ['tech-investment'],
  },
  {
    id: 'google-mega-cap-news',
    name: 'Mega-cap Tech',
    type: 'news',
    url: 'https://news.google.com/rss/search?q=(AAPL+OR+MSFT+OR+GOOGL+OR+AMZN+OR+META+OR+NVDA+OR+TSLA)+stock+OR+earnings+when:24h&hl=en-US&gl=US&ceid=US:en',
    tags: ['tech-investment'],
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
  netflix: 'NFLX',
  disney: 'DIS',
  boeing: 'BA',
  jpmorgan: 'JPM',
  'jp morgan': 'JPM',
  berkshire: 'BRK-B',
  oracle: 'ORCL',
  salesforce: 'CRM',
  broadcom: 'AVGO',
  qualcomm: 'QCOM',
  servicenow: 'NOW',
  'super micro': 'SMCI',
  supermicro: 'SMCI',
  micron: 'MU',
  trump: null,
  musk: 'TSLA',
  elon: 'TSLA',
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

    const rssSource =
      decodeHtml(block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim() ?? '');

    if (title) {
      items.push({
        headline: title.replace(/\s+/g, ' ').slice(0, 300),
        excerpt: description.replace(/\s+/g, ' ').slice(0, 400),
        url: link,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        sourceOverride: rssSource || undefined,
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
    if (symbol && lower.includes(alias) && universeSet.has(symbol)) {
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

function extractTickerFromHeadline(headline) {
  if (!universeSet) loadUniverse();
  const upper = headline.toUpperCase();
  const stockMatch = upper.match(/\b([A-Z]{1,5})\s+STOCK\b/);
  if (stockMatch && universeSet.has(stockMatch[1])) return stockMatch[1];

  const lower = headline.toLowerCase();
  for (const [alias, symbol] of Object.entries(COMPANY_ALIASES)) {
    if (symbol && lower.includes(alias) && universeSet.has(symbol)) return symbol;
  }
  return null;
}

function detectFigureTags(text, feedTags = []) {
  const lower = text.toLowerCase();
  const tags = new Set(feedTags ?? []);
  if (/trump|president trump|white house|tariff|executive order/i.test(lower)) tags.add('trump');
  if (/musk|elon musk|elonmusk/i.test(lower)) tags.add('musk');
  if (/bezos|zuckerberg|tim cook|satya nadella|jensen huang|sundar pichai|tech ceo/i.test(lower)) {
    tags.add('tech-ceo');
  }
  if (/youtube\.com|youtu\.be|video|speech|interview|press conference/i.test(lower)) tags.add('video');
  if (/site:x\.com|twitter|x\.com/i.test(lower)) tags.add('x-social');
  return [...tags];
}

function isVipMention(mention) {
  return (mention.figureTags?.length ?? 0) > 0;
}

function isVideoMention(mention) {
  return mention.contentType === 'video' || mention.figureTags?.includes('video');
}

function isXSocialMention(mention) {
  return mention.figureTags?.includes('x-social') || /x\.com|twitter/i.test(`${mention.source} ${mention.url}`);
}

function mentionKey(symbol, url, headline) {
  return `${symbol}|${url || headline.slice(0, 80).toLowerCase()}`;
}

function enrichMention(raw, feed, stockMap) {
  const text = `${raw.headline} ${raw.excerpt}`;
  let symbols = raw.forcedSymbol ? [raw.forcedSymbol] : extractSymbols(text);
  if (symbols.length === 0 && feed.id?.startsWith('tipranks')) {
    const fromHeadline = extractTickerFromHeadline(raw.headline);
    if (fromHeadline) symbols = [fromHeadline];
  }
  symbols = symbols.filter((s) => universeSet.has(s));
  if (symbols.length === 0) return [];

  const figureTags = detectFigureTags(text, feed.tags);
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
      contentType: raw.contentType ?? feed.contentType ?? 'article',
      hasTranscript: raw.hasTranscript ?? false,
      transcriptPreview: raw.transcriptPreview ?? undefined,
      figureTags,
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

function isTipRanksMention(mention) {
  const hay = `${mention.source} ${mention.headline} ${mention.url}`.toLowerCase();
  return hay.includes('tipranks') || hay.includes('tipranks.com');
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
    tipRanksNews: state.mentions.filter(isTipRanksMention).slice(0, 40),
    vipNews: state.mentions.filter(isVipMention).slice(0, 40),
    videoMentions: state.mentions.filter(isVideoMention).slice(0, 30),
    xSocialMentions: state.mentions.filter(isXSocialMention).slice(0, 30),
    status: {
      isMonitoring: Boolean(state.pollTimer),
      lastPollAt: state.lastPollAt,
      pollIntervalSeconds: POLL_INTERVAL_MS / 1000,
      feedsTotal: FEEDS.length + 2,
      feedsActive: Object.values(state.feedStatus).filter((f) => f.ok).length,
      feedStatus: state.feedStatus,
      mentionCount: state.mentions.length,
      earlyCount: earlyHits.length,
      tipRanksCount: state.mentions.filter(isTipRanksMention).length,
      vipCount: state.mentions.filter(isVipMention).length,
      videoCount: state.mentions.filter(isVideoMention).length,
      xSocialCount: state.mentions.filter(isXSocialMention).length,
      transcriptCount: state.mentions.filter((m) => m.hasTranscript).length,
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
  resetTranscriptPollBudget();

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
        const enrichedRaw = await enrichItemWithTranscript({
          ...item,
          contentType: feed.contentType ?? item.contentType,
        });
        const enriched = enrichMention(enrichedRaw, feed, stockMap);
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
  console.log(`Media Radar: monitoring ${FEEDS.length + 2} TV/social/news feeds every ${POLL_INTERVAL_MS / 1000}s`);

  pollFeeds(getStocks).catch((err) => console.warn('Media Radar initial poll failed:', err.message));

  state.pollTimer = setInterval(() => {
    pollFeeds(getStocks).catch((err) => console.warn('Media Radar poll failed:', err.message));
  }, POLL_INTERVAL_MS);
}

export async function forceMediaRadarPoll(getStocks) {
  await pollFeeds(getStocks);
  return getMediaRadarSnapshot(await getStocks());
}
