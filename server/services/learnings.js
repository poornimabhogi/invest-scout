import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { forecastNextDay } from './forecast.js';
import { DEFAULT_WEIGHTS as DEFAULT_WEIGHTS_IMPORT, clampLearningWeights } from './learningWeights.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const JOURNAL_FILE = path.join(DATA_DIR, 'prediction-journal.json');
const LEARNINGS_FILE = path.join(DATA_DIR, 'strategy-learnings.json');

const DEFAULT_WEIGHTS = { ...DEFAULT_WEIGHTS_IMPORT };

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson(file, fallback) {
  ensureDataDir();
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function getLearningWeights() {
  const data = loadJson(LEARNINGS_FILE, { weights: { ...DEFAULT_WEIGHTS }, lessons: [], stats: {} });
  return clampLearningWeights({ ...DEFAULT_WEIGHTS, ...data.weights });
}

function clampWeights(weights) {
  return clampLearningWeights(weights);
}

export function getLearningsState() {
  return loadJson(LEARNINGS_FILE, {
    weights: { ...DEFAULT_WEIGHTS },
    lessons: [],
    stats: { totalResolved: 0, directionAccuracy: 0, rangeAccuracy: 0 },
    lastUpdated: null,
  });
}

function saveLearnings(state) {
  state.lastUpdated = new Date().toISOString();
  saveJson(LEARNINGS_FILE, state);
}

export function loadJournal() {
  return loadJson(JOURNAL_FILE, { predictions: [], reports: [] });
}

function saveJournal(journal) {
  saveJson(JOURNAL_FILE, journal);
}

export function getNextTradingDayIso(fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function tradingDayKey(unixSec) {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

export function getCloseOnDate(candles, dateIso) {
  if (!candles?.length) return null;
  const exact = candles.find((c) => tradingDayKey(c.time) === dateIso);
  if (exact) return exact.close;
  const target = new Date(`${dateIso}T12:00:00Z`).getTime() / 1000;
  let best = null;
  let bestDiff = Infinity;
  for (const c of candles) {
    if (c.time <= target) {
      const diff = target - c.time;
      if (diff < bestDiff) {
        bestDiff = diff;
        best = c;
      }
    }
  }
  return best?.close ?? candles.at(-1)?.close ?? null;
}

function diagnosePrediction(pred, actualPrice) {
  const diagnosis = [];
  const actualChangePct =
    pred.currentPrice > 0 ? ((actualPrice - pred.currentPrice) / pred.currentPrice) * 100 : 0;
  const errorPct = pred.pointEstimate > 0
    ? ((actualPrice - pred.pointEstimate) / pred.pointEstimate) * 100
    : 0;

  const actualUp = actualChangePct > 0.15;
  const actualDown = actualChangePct < -0.15;
  const predictedUp = pred.direction === 'up';
  const predictedDown = pred.direction === 'down';

  let outcome = 'correct';

  if ((predictedUp && actualDown) || (predictedDown && actualUp)) {
    outcome = 'direction_wrong';
    diagnosis.push(
      `Direction miss: predicted ${pred.direction}, actual ${actualChangePct >= 0 ? '+' : ''}${actualChangePct.toFixed(2)}%`
    );
  } else if (pred.direction === 'flat' && (actualUp || actualDown)) {
    outcome = 'direction_wrong';
    diagnosis.push(`Expected flat day but stock moved ${actualChangePct.toFixed(2)}%`);
  }

  if (actualPrice < pred.lowEstimate || actualPrice > pred.highEstimate) {
    if (outcome === 'correct') outcome = 'range_miss';
    diagnosis.push(
      `Price $${actualPrice.toFixed(2)} landed outside forecast range $${pred.lowEstimate.toFixed(2)}–$${pred.highEstimate.toFixed(2)}`
    );
  }

  if (pred.confidence >= 75 && outcome !== 'correct') {
    diagnosis.push(`Overconfidence: ${pred.confidence}% confidence but forecast missed`);
  }

  const rsi = pred.factors?.rsi ?? 50;
  const goldenTrend = pred.factors?.goldenTrend;
  const pullbackInUptrend = pred.factors?.pullbackInUptrend;
  const macdTrend = pred.factors?.macdTrend;
  const conflictingSignals = pred.factors?.conflictingSignals;

  if (pullbackInUptrend && predictedDown && actualUp) {
    diagnosis.push(
      'Pullback-in-uptrend miss — short-term dip in golden trend; model over-weighted 5d momentum'
    );
  }
  if (macdTrend === 'bearish' && goldenTrend && predictedDown && actualUp) {
    diagnosis.push('MACD lag in uptrend — bearish MACD during price above SMA20/50 rally');
  }
  if (conflictingSignals && outcome !== 'correct') {
    diagnosis.push('Conflicting momentum (5d vs 20d) — forecast should have been lower confidence');
  }
  if (rsi > 70 && predictedUp && actualDown) {
    diagnosis.push('RSI overbought trap — momentum looked strong but mean-reversion won');
  }
  if (rsi < 35 && predictedUp && actualDown) {
    diagnosis.push('Oversold bounce failed — capitulation continued lower');
  }
  if ((pred.factors?.momentumScore ?? 0) > 5 && actualDown) {
    diagnosis.push('Momentum reversal — high momentum score did not carry to next session');
  }
  if (Math.abs(errorPct) > 3) {
    diagnosis.push(`Large point estimate error: ${errorPct >= 0 ? '+' : ''}${errorPct.toFixed(2)}% vs target`);
  }

  if (outcome === 'correct' && diagnosis.length === 0) {
    diagnosis.push('Forecast aligned with next-day move and range');
  }

  return {
    actualPrice: Math.round(actualPrice * 100) / 100,
    actualChangePct: Math.round(actualChangePct * 100) / 100,
    errorPct: Math.round(errorPct * 100) / 100,
    outcome,
    diagnosis,
  };
}

function applyLearningFromResults(results) {
  const state = getLearningsState();
  const weights = { ...DEFAULT_WEIGHTS, ...state.weights };
  const lessons = [...(state.lessons ?? [])];
  const today = new Date().toISOString().slice(0, 10);

  const counts = {
    direction_wrong: 0,
    rsi_trap: 0,
    momentum_reversal: 0,
    overconfidence: 0,
    range_miss: 0,
    macd_lag_uptrend: 0,
    pullback_uptrend: 0,
    conflicting_momentum: 0,
  };

  for (const r of results) {
    if (r.outcome === 'direction_wrong') counts.direction_wrong++;
    if (r.outcome === 'range_miss') counts.range_miss++;
    for (const d of r.diagnosis ?? []) {
      if (d.includes('Overconfidence')) counts.overconfidence++;
      if (d.includes('overbought trap')) counts.rsi_trap++;
      if (d.includes('Momentum reversal')) counts.momentum_reversal++;
      if (d.includes('MACD lag in uptrend')) counts.macd_lag_uptrend++;
      if (d.includes('Pullback-in-uptrend')) counts.pullback_uptrend++;
      if (d.includes('Conflicting momentum')) counts.conflicting_momentum++;
    }
  }

  const adjustments = [];

  if (counts.rsi_trap >= 2) {
    weights.rsiOverboughtPenalty = Math.min(0.008, weights.rsiOverboughtPenalty + 0.001);
    adjustments.push('Increased RSI overbought penalty — too many false bullish calls near RSI 70+');
  }
  if (counts.momentum_reversal >= 2) {
    weights.momentumMultiplier = Math.max(0.75, weights.momentumMultiplier - 0.08);
    adjustments.push('Reduced momentum drift weight — strong momentum reversed next day');
  }
  if (counts.range_miss >= 2) {
    weights.atrMultiplier = Math.min(1.4, weights.atrMultiplier + 0.1);
    adjustments.push('Widened forecast range (ATR multiplier) — prices exceeded expected band');
  }
  if (counts.overconfidence >= 2) {
    weights.highConfidenceThreshold = Math.min(85, weights.highConfidenceThreshold + 2);
    adjustments.push('Raised high-confidence bar — model was overconfident on misses');
  }
  if (counts.macd_lag_uptrend >= 2 || counts.pullback_uptrend >= 2) {
    weights.trendDamping = Math.max(0.15, (weights.trendDamping ?? 0.35) - 0.08);
    weights.pullbackDamping = Math.max(0.2, (weights.pullbackDamping ?? 0.45) - 0.1);
    weights.macdBearishPenalty = Math.max(0.0005, weights.macdBearishPenalty - 0.0003);
    adjustments.push(
      'Reduced MACD bearish weight in uptrends — lagging indicator caused false down calls'
    );
  }
  if (counts.conflicting_momentum >= 2) {
    weights.highConfidenceThreshold = Math.min(85, weights.highConfidenceThreshold + 1);
    adjustments.push('Raised confidence bar — too many misses when 5d/20d momentum conflicted');
  }
  if (counts.direction_wrong >= 3 && results.length >= 5) {
    weights.macdBearishPenalty = Math.min(0.003, weights.macdBearishPenalty + 0.0003);
    weights.macdBullishBoost = Math.max(0.0003, weights.macdBullishBoost - 0.0002);
    weights.momentumMultiplier = Math.max(0.75, weights.momentumMultiplier - 0.05);
    adjustments.push('Tightened short-term momentum after repeated direction misses');
    adjustments.push('Tightened MACD influence after repeated direction misses');
  }

  const correct = results.filter((r) => r.outcome === 'correct').length;
  const directionOk = results.filter((r) => r.outcome !== 'direction_wrong').length;

  if (results.length > 0) {
    state.stats = {
      totalResolved: (state.stats?.totalResolved ?? 0) + results.length,
      directionAccuracy: Math.round((directionOk / results.length) * 1000) / 10,
      rangeAccuracy: Math.round((correct / results.length) * 1000) / 10,
      lastBatchSize: results.length,
      lastBatchCorrect: correct,
    };
  }

  for (const adj of adjustments) {
    lessons.unshift({ date: today, text: adj, applied: true });
  }
  state.lessons = lessons.slice(0, 30);
  state.weights = clampWeights(weights);
  saveLearnings(state);

  return { adjustments, weights: state.weights, stats: state.stats };
}

export { applyLearningFromResults };

export function recordHighConfidencePredictions(forecasts, threshold) {
  const journal = loadJournal();
  const targetDate = getNextTradingDayIso();
  const existing = new Set(
    journal.predictions
      .filter((p) => p.status === 'pending' && p.targetDate === targetDate)
      .map((p) => p.symbol)
  );

  let added = 0;
  for (const f of forecasts) {
    if (f.confidence < threshold || existing.has(f.symbol)) continue;
    journal.predictions.unshift({
      id: randomUUID(),
      symbol: f.symbol,
      madeAt: new Date().toISOString(),
      targetDate,
      currentPrice: f.currentPrice,
      pointEstimate: f.pointEstimate,
      lowEstimate: f.lowEstimate,
      highEstimate: f.highEstimate,
      direction: f.direction,
      confidence: f.confidence,
      factors: {
        rsi: f.rsi,
        momentumScore: f.momentumScore ?? 0,
        drift: f.expectedChangePct / 100,
        atr: f.atr,
        mom5: f.factors?.mom5,
        mom20: f.factors?.mom20,
        macdTrend: f.factors?.macdTrend,
        goldenTrend: f.factors?.goldenTrend,
        pullbackInUptrend: f.factors?.pullbackInUptrend,
        conflictingSignals: f.factors?.conflictingSignals,
      },
      status: 'pending',
      actualPrice: null,
      actualChangePct: null,
      outcome: null,
      diagnosis: [],
    });
    added++;
  }

  journal.predictions = journal.predictions.slice(0, 500);
  saveJournal(journal);
  return { added, targetDate };
}

export async function resolvePendingPredictions(getCandlesAsync) {
  const journal = loadJournal();
  const today = new Date().toISOString().slice(0, 10);
  const resolved = [];

  for (const pred of journal.predictions) {
    if (pred.status !== 'pending' || pred.targetDate > today) continue;

    try {
      const candles = await getCandlesAsync(pred.symbol);
      const actualPrice = getCloseOnDate(candles, pred.targetDate);
      if (actualPrice == null) continue;

      const result = diagnosePrediction(pred, actualPrice);
      Object.assign(pred, result, {
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
      });
      resolved.push(pred);
    } catch {
      /* skip symbol */
    }
  }

  if (resolved.length > 0) saveJournal(journal);
  return resolved;
}

export async function runHistoricalSimulation(symbols, forecastFn, lookbackDays = 30) {
  const results = [];
  const threshold = getLearningWeights().highConfidenceThreshold;
  const maxPerSymbol = 3;
  const maxTotal = 20;

  for (const symbol of symbols.slice(0, 10)) {
    if (results.length >= maxTotal) break;
    try {
      const { candles } = await forecastFn(symbol);
      if (candles.length < lookbackDays + 40) continue;

      const start = candles.length - lookbackDays - 1;
      const end = candles.length - 1;
      const step = Math.max(1, Math.floor((end - start) / maxPerSymbol));
      let symbolCount = 0;

      for (let i = start; i < end && symbolCount < maxPerSymbol && results.length < maxTotal; i += step) {
        const slice = candles.slice(0, i + 1);
        const stock = { symbol, price: slice.at(-1).close, momentumScore: 0 };
        const forecast = forecastNextDay(slice, stock);
        if (forecast.confidence < threshold) continue;

        const actualPrice = candles[i + 1].close;
        const pred = {
          symbol,
          currentPrice: forecast.currentPrice,
          pointEstimate: forecast.pointEstimate,
          lowEstimate: forecast.lowEstimate,
          highEstimate: forecast.highEstimate,
          direction: forecast.direction,
          confidence: forecast.confidence,
          factors: {
            rsi: forecast.rsi,
            momentumScore: 0,
            mom5: forecast.factors?.mom5,
            mom20: forecast.factors?.mom20,
            macdTrend: forecast.factors?.macdTrend,
            goldenTrend: forecast.factors?.goldenTrend,
            pullbackInUptrend: forecast.factors?.pullbackInUptrend,
            conflictingSignals: forecast.factors?.conflictingSignals,
          },
          targetDate: tradingDayKey(candles[i + 1].time),
        };
        const result = diagnosePrediction(pred, actualPrice);
        results.push({ ...pred, ...result, simulated: true });
        symbolCount++;
      }
    } catch {
      /* skip */
    }
  }

  return results;
}

export function buildReport(resolved, simulated, newPredictions, learningResult) {
  const all = [...resolved, ...simulated];
  const correct = all.filter((r) => r.outcome === 'correct').length;
  const directionOk = all.filter((r) => r.outcome !== 'direction_wrong').length;

  const wrongItems = all
    .filter((r) => r.outcome !== 'correct')
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 15);

  const summary =
    all.length === 0
      ? 'No predictions ready to grade yet. Record high-confidence picks today and run again after the next trading session.'
      : `${correct}/${all.length} forecasts landed in range (${Math.round((correct / all.length) * 100)}%). Direction accuracy: ${Math.round((directionOk / all.length) * 100)}%.`;

  return {
    generatedAt: new Date().toISOString(),
    summary,
    stats: {
      graded: all.length,
      correct,
      directionAccuracy: all.length ? Math.round((directionOk / all.length) * 1000) / 10 : 0,
      rangeAccuracy: all.length ? Math.round((correct / all.length) * 1000) / 10 : 0,
      resolvedLive: resolved.length,
      simulatedHistorical: simulated.length,
    },
    whatWentWrong: wrongItems.map((r) => ({
      symbol: r.symbol,
      targetDate: r.targetDate,
      confidence: r.confidence,
      predicted: r.pointEstimate,
      actual: r.actualPrice,
      outcome: r.outcome,
      diagnosis: r.diagnosis,
      simulated: r.simulated ?? false,
    })),
    strategyAdjustments: learningResult.adjustments,
    updatedWeights: learningResult.weights,
    cumulativeStats: learningResult.stats,
    newPredictionsRecorded: newPredictions.added,
    nextTargetDate: newPredictions.targetDate,
  };
}

export function saveReport(report) {
  const journal = loadJournal();
  journal.reports = [report, ...(journal.reports ?? [])].slice(0, 20);
  saveJournal(journal);
}

export function getLatestReport() {
  const journal = loadJournal();
  const learnings = getLearningsState();
  return {
    report: journal.reports?.[0] ?? null,
    pendingCount: journal.predictions.filter((p) => p.status === 'pending').length,
    learnings,
    recentPredictions: journal.predictions.slice(0, 10),
  };
}
