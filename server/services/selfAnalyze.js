import { getCandles } from './candles.js';
import { getScreenerData } from './screener.js';
import { buildMergedScreener } from './mediaSignalProcessor.js';
import { forecastNextDay } from './forecast.js';
import { analyzeTopPicksIndicators } from './chartStackAnalysis.js';
import { getPortfolioBacktest } from './compound.js';
import { getRiskContext } from './riskManagement.js';
import { updateAutoTradeSettings } from './paperAutoTradeSettings.js';
import { runPaperAutoTrade } from './paperAutoTrader.js';
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
  return (await buildMergedScreener(base, { processMedia: true })).topPicks ?? [];
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

function summarizeIndicatorAnalysis(indicatorAnalysis) {
  if (!indicatorAnalysis.length) {
    return { symbolsAnalyzed: 0, confirmsMedia: 0, avgBullish: 0, avgBearish: 0 };
  }
  const confirmsMedia = indicatorAnalysis.filter((i) => i.indicatorAudit?.confirmsMedia).length;
  const avgBullish =
    Math.round(
      (indicatorAnalysis.reduce((s, i) => s + (i.indicatorAudit?.summary?.bullish ?? 0), 0) /
        indicatorAnalysis.length) *
        10
    ) / 10;
  const avgBearish =
    Math.round(
      (indicatorAnalysis.reduce((s, i) => s + (i.indicatorAudit?.summary?.bearish ?? 0), 0) /
        indicatorAnalysis.length) *
        10
    ) / 10;

  return {
    symbolsAnalyzed: indicatorAnalysis.length,
    confirmsMedia,
    avgBullish,
    avgBearish,
  };
}

function buildAutoTradeCandidates(indicatorAnalysis, picks) {
  const pickMap = new Map(picks.map((p) => [p.symbol, p]));
  return indicatorAnalysis
    .filter(
      (i) =>
        i.indicatorAudit?.confirmsMedia &&
        i.recommendation !== 'avoid' &&
        (i.strategyScore ?? 0) >= 10
    )
    .sort((a, b) => (b.strategyScore ?? 0) - (a.strategyScore ?? 0))
    .slice(0, 10)
    .map((i) => ({
      symbol: i.symbol,
      strategyScore: i.strategyScore,
      recommendation: i.recommendation,
      confirmsMedia: i.indicatorAudit.confirmsMedia,
      primaryReason: i.indicatorAudit.primaryReason,
      bullishIndicators: i.indicatorAudit.summary?.bullish ?? 0,
      confluence: i.confluence?.label ?? pickMap.get(i.symbol)?.confluence?.label,
    }));
}

export async function runSelfAnalysis({
  includeSimulation = true,
  resolvePrice = null,
  triggerAutoTrade = true,
} = {}) {
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
  const indicatorAnalysis = await analyzeTopPicksIndicators(picks, 15);
  const indicatorAuditSummary = summarizeIndicatorAnalysis(indicatorAnalysis);
  const autoTradeCandidates = buildAutoTradeCandidates(indicatorAnalysis, picks);

  const strategySymbols = picks.filter((p) => p.strategyRecommendation === 'buy').map((p) => p.symbol);
  const allSymbols = [...new Set([...picks.map((p) => p.symbol), ...strategySymbols])];
  const forecasts = await buildForecastsForSymbols(allSymbols);
  const newPredictions = recordHighConfidencePredictions(
    forecasts,
    getLearningWeights().highConfidenceThreshold
  );

  const baseReport = buildReport(resolved, simulated, newPredictions, learningResult);

  const backtest = await getPortfolioBacktest().catch(() => null);
  const riskContext = getRiskContext({ backtest });

  const report = {
    ...baseReport,
    indicatorAnalysis: indicatorAnalysis.map((i) => ({
      symbol: i.symbol,
      recommendation: i.recommendation,
      strategyScore: i.strategyScore,
      rsi: i.rsi,
      macdTrend: i.macdTrend,
      squeezeOn: i.squeezeOn,
      smcRecommendation: i.smcRecommendation,
      msbRecommendation: i.msbRecommendation,
      utBotRecommendation: i.utBotRecommendation,
      oteRecommendation: i.oteRecommendation,
      oteInZone: i.oteInZone,
      indicatorAudit: {
        confirmsMedia: i.indicatorAudit?.confirmsMedia,
        primaryReason: i.indicatorAudit?.primaryReason,
        summary: i.indicatorAudit?.summary,
        confluence: i.indicatorAudit?.confluence?.label,
      },
    })),
    indicatorAuditSummary,
    autoTradeCandidates,
    riskContext: {
      riskLevel: riskContext.riskLevel,
      positionSizePct: riskContext.positionSizePct,
      maxDailyTrades: riskContext.maxDailyTrades,
      minStrategyScore: riskContext.minStrategyScore,
      compoundHint: riskContext.compoundHint,
    },
  };

  updateAutoTradeSettings({
    lastIndicatorSnapshots: Object.fromEntries(
      indicatorAnalysis.map((i) => [
        i.symbol,
        {
          confirmsMedia: i.indicatorAudit?.confirmsMedia,
          recommendation: i.recommendation,
          strategyScore: i.strategyScore,
          primaryReason: i.indicatorAudit?.primaryReason,
          summary: i.indicatorAudit?.summary,
        },
      ])
    ),
    lastRiskContext: report.riskContext,
  });

  saveReport(report);

  if (triggerAutoTrade && resolvePrice) {
    try {
      const autoResult = await runPaperAutoTrade(resolvePrice, { fromSelfAnalyze: true });
      report.autoTradeRun = {
        ok: autoResult.ok,
        skipped: autoResult.skipped,
        reason: autoResult.reason,
        actions: autoResult.actions ?? [],
        riskGate: autoResult.riskGate,
      };
      saveReport(report);
    } catch (err) {
      report.autoTradeRun = { ok: false, error: err.message };
      saveReport(report);
    }
  }

  return report;
}

export { getLatestReport };
