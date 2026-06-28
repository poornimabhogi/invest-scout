import { getCandles } from './candles.js';
import { getScreenerData } from './screener.js';
import { getStrategies } from './strategies.js';
import { mergeSignalsIntoScreener } from './signalMerge.js';
import { getMediaRadarSnapshot } from './mediaRadar.js';
import { forecastNextDay } from './forecast.js';
import {
  getLearningWeights,
  resolvePendingPredictions,
  recordHighConfidencePredictions,
  runHistoricalSimulation,
  buildReport,
  saveReport,
  getLatestReport,
  applyLearningFromResults,
} from './learnings.js';

async function getEnrichedTopPicks() {
  const base = await getScreenerData();
  const stocks = base.stocks ?? [];
  const [strategies, media] = await Promise.all([
    getStrategies(stocks, false),
    Promise.resolve(getMediaRadarSnapshot(stocks)),
  ]);
  return mergeSignalsIntoScreener(base, strategies, media).topPicks ?? [];
}

async function buildForecastsForSymbols(symbols) {
  const screener = await getScreenerData();
  const forecasts = [];

  for (const sym of symbols) {
    try {
      const symbol = typeof sym === 'string' ? sym : sym.symbol;
      const stock = screener.stocks?.find((s) => s.symbol === symbol) ?? {
        symbol,
        momentumScore: 0,
      };
      const { candles } = await getCandles(symbol, '1Y');
      const forecast = forecastNextDay(candles, stock);
      forecasts.push({
        ...forecast,
        symbol,
        momentumScore: stock.momentumScore ?? 0,
      });
    } catch {
      /* skip */
    }
  }
  return forecasts;
}

export async function runSelfAnalysis({ includeSimulation = true } = {}) {
  const weights = getLearningWeights();
  const candleCache = new Map();

  async function getCandlesCached(symbol) {
    if (!candleCache.has(symbol)) {
      const { candles } = await getCandles(symbol, '1Y');
      candleCache.set(symbol, candles);
    }
    return candleCache.get(symbol);
  }

  const resolved = [];
  for (const r of await resolvePendingPredictions(async (symbol) => {
    if (!candleCache.has(symbol)) await getCandlesCached(symbol);
    return candleCache.get(symbol);
  })) {
    resolved.push(r);
  }

  let simulated = [];
  if (resolved.length === 0 && includeSimulation) {
    const picks = await getEnrichedTopPicks();
    const symbols = picks.map((p) => p.symbol);
    simulated = await runHistoricalSimulation(symbols, async (symbol) => {
      const { candles } = await getCandles(symbol, '1Y');
      return { candles };
    });
  }

  const learningResult = applyLearningFromResults([...resolved, ...simulated]);

  const picks = await getEnrichedTopPicks();
  const strategySymbols = picks.filter((p) => p.strategyRecommendation === 'buy').map((p) => p.symbol);
  const allSymbols = [...new Set([...picks.map((p) => p.symbol), ...strategySymbols])];
  const forecasts = await buildForecastsForSymbols(allSymbols);
  const newPredictions = recordHighConfidencePredictions(
    forecasts,
    getLearningWeights().highConfidenceThreshold
  );

  const report = buildReport(resolved, simulated, newPredictions, learningResult);
  saveReport(report);

  return report;
}

export { getLatestReport };
