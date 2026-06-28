import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getPreferences, savePreferences } from './store.js';
import { getScreenerData, getCacheStatus } from './services/screener.js';
import { getCandles, computePerformance } from './services/candles.js';
import { analyzeSmartMoneyConcepts } from './services/smartMoneyConcepts.js';
import { getStrategies, getStockDetail } from './services/strategies.js';
import { mergeSignalsIntoScreener } from './services/signalMerge.js';
import { getStockForecast, getPortfolioBacktest, runCompoundSimulation } from './services/compound.js';
import {
  buyShares,
  sellShares,
  resetPortfolio,
  getEnrichedPortfolio,
  getPriceFromStocks,
} from './services/paperPortfolio.js';
import {
  getMediaRadarSnapshot,
  startMediaRadarMonitor,
  forceMediaRadarPoll,
  subscribeMediaRadar,
} from './services/mediaRadar.js';
import { runSelfAnalysis, getLatestReport } from './services/selfAnalyze.js';
import {
  buildWatchlist,
  updateWatchlistSettings,
  pinSymbol,
  unpinSymbol,
  excludeSymbol,
} from './services/watchlist.js';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    version: '7',
    routes: ['stocks', 'candles', 'strategies', 'paper', 'media-radar', 'signal-merge', 'self-analyze', 'watchlist'],
  });
});

app.get('/api/screener/status', (_req, res) => {
  res.json(getCacheStatus());
});

app.post('/api/screener/refresh', async (_req, res) => {
  try {
    const data = await getScreenerData(true);
    res.json({ ok: true, lastUpdated: data.lastUpdated, stockCount: data.stocks.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/market-data', async (req, res) => {
  try {
    const view = req.query.view || 'all';
    const base = await getScreenerData();
    const stocks = base.stocks ?? [];
    const [strategies, mediaSnapshot] = await Promise.all([
      getStrategies(stocks, false),
      Promise.resolve(getMediaRadarSnapshot(stocks)),
    ]);
    const data = mergeSignalsIntoScreener(base, strategies, mediaSnapshot);

    switch (view) {
      case 'top-picks':
        res.json(data.topPicks);
        break;
      case 'momentum':
        res.json(data.momentumLeaders);
        break;
      case 'celebrity':
        res.json(data.celebrityPicks);
        break;
      default:
        res.json(data.stocks);
    }
  } catch (err) {
    console.error('Screener error:', err);
    res.status(500).json({ error: 'Failed to fetch market data', message: err.message });
  }
});

app.get('/api/celebrities', async (_req, res) => {
  try {
    const data = await getScreenerData();
    res.json(data.celebrities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stocks/:symbol/forecast', async (req, res) => {
  try {
    const forecast = await getStockForecast(req.params.symbol);
    res.json(forecast);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backtest/summary', async (_req, res) => {
  try {
    const summary = await getPortfolioBacktest();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/self-analyze', (_req, res) => {
  try {
    res.json(getLatestReport());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/self-analyze/run', async (req, res) => {
  try {
    const includeSimulation = req.body?.includeSimulation !== false;
    const report = await runSelfAnalysis({ includeSimulation });
    res.json(report);
  } catch (err) {
    console.error('Self-analyze error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/watchlist', async (_req, res) => {
  try {
    const data = await buildWatchlist();
    res.json(data);
  } catch (err) {
    console.error('Watchlist error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/watchlist/settings', async (req, res) => {
  try {
    updateWatchlistSettings(req.body);
    const data = await buildWatchlist();
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/watchlist/pin/:symbol', async (req, res) => {
  try {
    pinSymbol(req.params.symbol);
    const data = await buildWatchlist();
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/watchlist/pin/:symbol', async (req, res) => {
  try {
    unpinSymbol(req.params.symbol);
    const data = await buildWatchlist();
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/watchlist/exclude/:symbol', async (req, res) => {
  try {
    excludeSymbol(req.params.symbol);
    const data = await buildWatchlist();
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/compound/simulate', (req, res) => {
  try {
    const result = runCompoundSimulation(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/stocks/:symbol/candles', async (req, res) => {
  try {
    const { symbol } = req.params;
    const range = req.query.range || '1Y';
    const { candles, source } = await getCandles(symbol.toUpperCase(), range);
    const performance = computePerformance(candles);
    const smc = analyzeSmartMoneyConcepts(candles);
    res.json({ symbol: symbol.toUpperCase(), range, candles, performance, source, smc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stocks/:symbol/smc', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const range = req.query.range || '1Y';
    const { candles, source } = await getCandles(symbol, range);
    const smc = analyzeSmartMoneyConcepts(candles);
    res.json({ symbol, range, source, smc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stocks/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const screener = await getScreenerData();
    const stock = screener.stocks?.find((s) => s.symbol === symbol);
    const detail = await getStockDetail(symbol, stock);
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/strategies', async (req, res) => {
  try {
    const force = req.query.refresh === 'true';
    const screener = await getScreenerData();
    const strategies = await getStrategies(screener.stocks ?? [], force);
    res.json(strategies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function getStocksForRadar() {
  const screener = await getScreenerData();
  return screener.stocks ?? [];
}

app.get('/api/media-radar', async (_req, res) => {
  try {
    const stocks = await getStocksForRadar();
    res.json(getMediaRadarSnapshot(stocks));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/media-radar/poll', async (_req, res) => {
  try {
    const snapshot = await forceMediaRadarPoll(getStocksForRadar);
    res.json(snapshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/media-radar/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const stocks = await getStocksForRadar();
    send(getMediaRadarSnapshot(stocks));
  } catch (err) {
    send({ error: err.message });
  }

  const unsubscribe = subscribeMediaRadar(send);
  req.on('close', unsubscribe);
});

async function resolvePrices(symbols) {
  const map = {};
  for (const sym of symbols) {
    try {
      map[sym] = await resolveSymbolPrice(sym, null);
    } catch {
      /* enrichPortfolio falls back to avgCost */
    }
  }
  return map;
}

async function resolveSymbolPrice(symbol, clientPrice) {
  const sym = symbol.toUpperCase();
  const parsed = Number(clientPrice);
  if (parsed > 0) return parsed;

  const screener = await getScreenerData();
  const fromScreener = getPriceFromStocks(screener.stocks ?? [], sym);
  if (fromScreener && fromScreener > 0) return fromScreener;

  try {
    const { candles } = await getCandles(sym, '1D');
    const last = candles.at(-1)?.close;
    if (last && last > 0) return last;
  } catch {
    /* fall through */
  }

  throw new Error(`Price unavailable for ${sym}`);
}

app.get('/api/paper/portfolio', async (_req, res) => {
  try {
    const portfolio = await getEnrichedPortfolio(resolvePrices);
    res.json(portfolio);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/paper/buy', async (req, res) => {
  try {
    const { symbol, shares, note, price: clientPrice } = req.body;
    const price = await resolveSymbolPrice(symbol, clientPrice);
    buyShares(symbol, shares, price, note ?? '');
    const portfolio = await getEnrichedPortfolio(resolvePrices);
    res.json(portfolio);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/paper/sell', async (req, res) => {
  try {
    const { symbol, shares, note, price: clientPrice } = req.body;
    const price = await resolveSymbolPrice(symbol, clientPrice);
    sellShares(symbol, shares, price, note ?? '');
    const portfolio = await getEnrichedPortfolio(resolvePrices);
    res.json(portfolio);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/paper/reset', async (req, res) => {
  try {
    const startingCash = req.body.startingCash ?? 100_000;
    resetPortfolio(startingCash);
    const portfolio = await getEnrichedPortfolio(resolvePrices);
    res.json(portfolio);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/trading-preferences', (_req, res) => {
  res.json(getPreferences());
});

app.put('/api/trading-preferences', (req, res) => {
  const { maxPositionSize, riskLevel, maxDailyTrades, stopLossPercentage, takeProfitPercentage } =
    req.body;
  const preferences = {
    maxPositionSize: Number(maxPositionSize),
    riskLevel,
    maxDailyTrades: Number(maxDailyTrades),
    stopLossPercentage: Number(stopLossPercentage),
    takeProfitPercentage: Number(takeProfitPercentage),
    updatedAt: new Date().toISOString(),
  };
  savePreferences(preferences);
  res.json(preferences);
});

app.listen(PORT, () => {
  console.log(`Local API running at http://localhost:${PORT}`);
  getScreenerData().catch((err) => console.error('Initial screener load failed:', err.message));
  startMediaRadarMonitor(getStocksForRadar);

  subscribeMediaRadar((payload) => {
    if (payload?.earlyHits?.length) {
      getStocksForRadar()
        .then((stocks) => getStrategies(stocks, true))
        .catch(() => {});
    }
  });
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is in use. Run: npx kill-port ${PORT}`);
    console.error('Then restart with: npm run dev');
  } else {
    console.error('Server failed to start:', err.message);
  }
  process.exit(1);
});
