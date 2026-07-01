import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getPreferences, savePreferences } from './store.js';
import { getScreenerData, getCacheStatus } from './services/screener.js';
import { getCandles, computePerformance } from './services/candles.js';
import { analyzeSmartMoneyConcepts } from './services/smartMoneyConcepts.js';
import { analyzeMarketStructureBreak } from './services/marketStructureBreak.js';
import { analyzeUtBot } from './services/utBot.js';
import { analyzeOptimalTradeEntry } from './services/optimalTradeEntry.js';
import { getStrategies, getStockDetail } from './services/strategies.js';
import { getStockForecast, getPortfolioBacktest, runCompoundSimulation } from './services/compound.js';
import {
  buyShares,
  sellShares,
  resetPortfolio,
  getEnrichedPortfolio,
  getPriceFromStocks,
} from './services/paperPortfolio.js';
import { fetchLivePrice, fetchLivePrices } from './services/livePrices.js';
import {
  getMediaRadarSnapshot,
  startMediaRadarMonitor,
  forceMediaRadarPoll,
  subscribeMediaRadar,
} from './services/mediaRadar.js';
import { buildMergedScreener, processMediaSnapshot, getMediaProcessingResult } from './services/mediaSignalProcessor.js';
import { runSelfAnalysis, getLatestReport } from './services/selfAnalyze.js';
import {
  buildWatchlist,
  updateWatchlistSettings,
  pinSymbol,
  unpinSymbol,
  excludeSymbol,
} from './services/watchlist.js';
import {
  getAutoTradeSettings,
  updateAutoTradeSettings,
  applyAccuracyModePreset,
  ACCURACY_MODE_TRADING_PREFS,
} from './services/paperAutoTradeSettings.js';
import {
  runPaperAutoTrade,
  getAutoTradeStatus,
  startPaperAutoTradeMonitor,
} from './services/paperAutoTrader.js';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    version: '8',
    routes: ['stocks', 'candles', 'strategies', 'paper', 'paper-auto-trade', 'media-radar', 'signal-merge', 'self-analyze', 'watchlist'],
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
    const data = await buildMergedScreener(base, { processMedia: true });

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
    const triggerAutoTrade = req.body?.triggerAutoTrade !== false;
    const report = await runSelfAnalysis({
      includeSimulation,
      resolvePrice: resolveSymbolPrice,
      triggerAutoTrade,
    });
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
    const msb = analyzeMarketStructureBreak(candles);
    const utBot = analyzeUtBot(candles);
    const ote = analyzeOptimalTradeEntry(candles);
    res.json({ symbol: symbol.toUpperCase(), range, candles, performance, source, smc, msb, utBot, ote });
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

function attachMediaProcessing(snapshot, processing) {
  return { ...snapshot, processing };
}

app.get('/api/media-radar', async (_req, res) => {
  try {
    const stocks = await getStocksForRadar();
    const snapshot = getMediaRadarSnapshot(stocks);
    const processing = getMediaProcessingResult();
    res.json(attachMediaProcessing(snapshot, processing));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/media-radar/poll', async (_req, res) => {
  try {
    const stocks = await getStocksForRadar();
    await forceMediaRadarPoll(getStocksForRadar);
    const snapshot = getMediaRadarSnapshot(stocks);
    const processing = await processMediaSnapshot(snapshot, stocks, { force: true });
    res.json(attachMediaProcessing(snapshot, processing));
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
  const map = await fetchLivePrices(symbols);

  const missing = symbols.filter((s) => !map[s.toUpperCase()]);
  if (missing.length) {
    const screener = await getScreenerData();
    for (const sym of missing) {
      const upper = sym.toUpperCase();
      const fromScreener = getPriceFromStocks(screener.stocks ?? [], upper);
      if (fromScreener && fromScreener > 0) map[upper] = fromScreener;
    }
  }

  for (const sym of symbols) {
    const upper = sym.toUpperCase();
    if (map[upper] > 0) continue;
    try {
      const { candles, source } = await getCandles(upper, '1D');
      const last = candles.at(-1)?.close;
      if (last && last > 0 && source !== 'seed') map[upper] = last;
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

  const live = await fetchLivePrice(sym);
  if (live && live > 0) return live;

  const screener = await getScreenerData();
  const fromScreener = getPriceFromStocks(screener.stocks ?? [], sym);
  if (fromScreener && fromScreener > 0) return fromScreener;

  try {
    const { candles, source } = await getCandles(sym, '1D');
    const last = candles.at(-1)?.close;
    if (last && last > 0 && source !== 'seed') return last;
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

app.get('/api/paper/auto-trade', (_req, res) => {
  try {
    res.json(getAutoTradeStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/paper/auto-trade/settings', (req, res) => {
  try {
    const allowed = [
      'enabled',
      'accuracyMode',
      'maxPositions',
      'positionSizePct',
      'minStrategyScore',
      'minVerifiedPerfScore',
      'minBullishIndicators',
      'maxBearishIndicators',
      'requireDualStructureForTopPick',
      'buyTopPicks',
      'buyChartVerified',
      'buyPremiumEntry',
      'buyLuxConfirmation',
      'buyLuxStrongOnly',
      'buyGainzAlgo',
      'gainzAlgoMode',
      'gainzMinConfidence',
      'buyWvfCapitulation',
      'wvfMinCoreBullish',
      'sellOnAvoid',
      'useStopLossTakeProfit',
      'requireChartAudit',
      'applySelfAnalyzeGates',
      'cooldownHours',
      'useCapSplitting',
      'investmentAmount',
      'splitLargePct',
      'splitMidPct',
      'splitSmallPct',
    ];
    const partial = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) partial[key] = req.body[key];
    }
    const settings = updateAutoTradeSettings(partial);
    res.json({ settings, ...getAutoTradeStatus() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/paper/auto-trade/accuracy-mode', (req, res) => {
  try {
    const enable = req.body?.enable !== false;
    const settings = applyAccuracyModePreset(enable);

    let tradingPreferences = null;
    if (enable) {
      const existing = getPreferences() ?? {};
      tradingPreferences = {
        ...existing,
        ...ACCURACY_MODE_TRADING_PREFS,
        maxPositionSize: existing.maxPositionSize ?? 1000,
        updatedAt: new Date().toISOString(),
      };
      savePreferences(tradingPreferences);
    }

    res.json({
      settings,
      tradingPreferences,
      ...getAutoTradeStatus(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/paper/auto-trade/run', async (_req, res) => {
  try {
    const result = await runPaperAutoTrade(resolveSymbolPrice, { force: true });
    const portfolio = await getEnrichedPortfolio(resolvePrices);
    res.json({ ...result, portfolio });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
  startPaperAutoTradeMonitor(resolveSymbolPrice);

  subscribeMediaRadar((payload) => {
    if (payload?.mentions?.length || payload?.earlyHits?.length) {
      getStocksForRadar()
        .then(async (stocks) => {
          await processMediaSnapshot(payload, stocks, { force: false });
          await getStrategies(stocks, true);
          await runPaperAutoTrade(resolveSymbolPrice).catch(() => {});
        })
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
