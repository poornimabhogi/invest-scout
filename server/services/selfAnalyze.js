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

function buildAutoTradeCandidates(indicatorAnalysis, picks, forecasts = [], weights = null) {
  const pickMap = new Map(picks.map((p) => [p.symbol, p]));
  const forecastMap = new Map(forecasts.map((f) => [f.symbol, f]));
  const w = weights ?? getLearningWeights();

  return indicatorAnalysis
    .filter((i) => {
      const bullish = i.indicatorAudit?.summary?.bullish ?? 0;
      const bearish = i.indicatorAudit?.summary?.bearish ?? 0;
      const forecast = forecastMap.get(i.symbol);
      const rsi = i.rsi ?? forecast?.rsi ?? 50;
      const dualStructure = i.confluence?.dualStructure;
      const forecastAligned =
        !forecast ||
        forecast.direction !== 'down' ||
        bullish >= 4;

      if (forecast?.direction === 'up' && rsi > 72 && !dualStructure && (forecast.confidence ?? 0) >= 75) {
        return false;
      }
      if (
        forecast?.direction === 'up' &&
        rsi > 70 &&
        (i.momentumScore ?? 0) > 5 &&
        (w.momentumMultiplier ?? 1) < 0.85
      ) {
        return false;
      }

      return (
        i.indicatorAudit?.confirmsMedia &&
        i.recommendation !== 'avoid' &&
        bullish >= 4 &&
        bearish <= 2 &&
        (i.strategyScore ?? 0) >= 50 &&
        forecastAligned
      );
    })
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

function buildForecastConflicts(indicatorAnalysis, forecasts) {
  const forecastMap = new Map(forecasts.map((f) => [f.symbol, f]));
  const conflicts = [];

  for (const ind of indicatorAnalysis) {
    const forecast = forecastMap.get(ind.symbol);
    if (!forecast) continue;

    const bullish = ind.indicatorAudit?.summary?.bullish ?? 0;
    const bearish = ind.indicatorAudit?.summary?.bearish ?? 0;

    if (forecast.direction === 'down' && bullish >= 4) {
      conflicts.push({
        symbol: ind.symbol,
        issue: 'Forecast bearish but chart audit bullish',
        forecastDirection: forecast.direction,
        forecastConfidence: forecast.confidence,
        bullishIndicators: bullish,
        suggestion: 'Trust chart structure over short-term drift; do not auto-log bearish forecast',
      });
    }
    if (forecast.direction === 'up' && bearish >= 4) {
      conflicts.push({
        symbol: ind.symbol,
        issue: 'Forecast bullish but chart audit bearish',
        forecastDirection: forecast.direction,
        forecastConfidence: forecast.confidence,
        bearishIndicators: bearish,
        suggestion: 'Reduce confidence or wait for structure confirmation',
      });
    }
    if (forecast.factors?.conflictingSignals && forecast.confidence >= 70) {
      conflicts.push({
        symbol: ind.symbol,
        issue: 'High confidence despite 5d/20d momentum conflict',
        forecastDirection: forecast.direction,
        forecastConfidence: forecast.confidence,
        suggestion: 'Model flagged internal conflict — confidence should stay below threshold',
      });
    }
    const rsi = ind.rsi ?? forecast.rsi ?? 50;
    if (forecast.direction === 'up' && rsi > 72 && (ind.momentumScore ?? 0) > 4) {
      conflicts.push({
        symbol: ind.symbol,
        issue: 'RSI overbought trap risk — strong momentum at RSI 72+',
        forecastDirection: forecast.direction,
        forecastConfidence: forecast.confidence,
        bullishIndicators: bullish,
        suggestion: 'Lessons: reduce bullish drift when RSI extended; require dual structure',
      });
    }
  }

  return conflicts.slice(0, 10);
}

function filterForecastsForRecording(forecasts, indicatorAnalysis, conflicts) {
  const conflictSymbols = new Set(conflicts.map((c) => c.symbol));
  const indMap = new Map(indicatorAnalysis.map((i) => [i.symbol, i]));
  const w = getLearningWeights();

  return forecasts.filter((f) => {
    if (conflictSymbols.has(f.symbol)) return false;
    if (f.factors?.conflictingSignals && f.confidence >= 70) return false;

    const ind = indMap.get(f.symbol);
    const rsi = f.rsi ?? ind?.rsi ?? 50;
    if (f.direction === 'up' && rsi > 72 && (ind?.momentumScore ?? 0) > 4) return false;
    if (f.direction === 'up' && rsi > 70 && f.confidence > w.highConfidenceThreshold + 10) return false;

    if (!ind) return true;

    const bullish = ind.indicatorAudit?.summary?.bullish ?? 0;
    if (f.direction === 'down' && bullish >= 4) return false;
    if (f.direction === 'up' && (ind.indicatorAudit?.summary?.bearish ?? 0) >= 4) return false;

    return true;
  });
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

  const strategySymbols = picks.filter((p) => p.strategyRecommendation === 'buy').map((p) => p.symbol);
  const allSymbols = [...new Set([...picks.map((p) => p.symbol), ...strategySymbols])];
  const forecasts = await buildForecastsForSymbols(allSymbols);
  const forecastConflicts = buildForecastConflicts(indicatorAnalysis, forecasts);
  const recordableForecasts = filterForecastsForRecording(
    forecasts,
    indicatorAnalysis,
    forecastConflicts
  );
  const autoTradeCandidates = buildAutoTradeCandidates(
    indicatorAnalysis,
    picks,
    forecasts,
    learningResult.weights
  );

  const newPredictions = recordHighConfidencePredictions(
    recordableForecasts,
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
    forecastConflicts,
    modelImprovements: learningResult.adjustments,
    forecastsFiltered: forecasts.length - recordableForecasts.length,
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
