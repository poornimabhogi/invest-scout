import { computeRSI, computeSMA, computeMACD } from './chartAnalysis.js';
import { getLearningWeights } from './learningWeights.js';

function computeATR(candles, period = 14) {
  if (candles.length < period + 1) return candles.at(-1)?.close * 0.02 ?? 1;
  const trs = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)));
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

function dailyReturns(closes) {
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return returns;
}

function avgMomentum(returns, days) {
  const slice = returns.slice(-days);
  if (!slice.length) return 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function totalReturnMomentum(closes, days) {
  if (closes.length < days + 1) return 0;
  const start = closes[closes.length - days - 1];
  const end = closes.at(-1);
  if (!start || start <= 0) return 0;
  return (end - start) / start / days;
}

function detectTrendRegime(closes, sma20, sma50, lastClose) {
  const goldenTrend = sma20 && sma50 && lastClose > sma20 && sma20 > sma50;
  const aboveSma50 = sma50 && lastClose > sma50;
  const aboveSma20 = sma20 && lastClose > sma20;
  return { goldenTrend, aboveSma50, aboveSma20 };
}

function histogramRising(macd) {
  const series = macd.series ?? [];
  if (series.length < 2) return false;
  const last = series.at(-1)?.histogram;
  const prev = series.at(-2)?.histogram;
  return last != null && prev != null && last > prev;
}

/** Simple signal: would our rules have flagged a buy on this slice? */
function isBuySetup(candles) {
  if (candles.length < 30) return false;
  const closes = candles.map((c) => c.close);
  const rsi = computeRSI(closes);
  const sma20 = computeSMA(closes, 20);
  const sma50 = computeSMA(closes, 50);
  const last = closes.at(-1);
  const momentum5 =
    closes.length >= 6 ? (last - closes[closes.length - 6]) / closes[closes.length - 6] : 0;

  return (
    rsi >= 40 &&
    rsi <= 68 &&
    last > (sma20 ?? last) &&
    (sma50 ? last > sma50 * 0.98 : true) &&
    momentum5 > -0.02
  );
}

/**
 * Walk-forward backtest: when buy setup fires, did next day close higher?
 */
export function backtestSymbol(candles, lookbackDays = 90) {
  const minHistory = 35;
  const start = Math.max(minHistory, candles.length - lookbackDays - 1);
  const trades = [];

  for (let i = start; i < candles.length - 1; i++) {
    const slice = candles.slice(0, i + 1);
    if (!isBuySetup(slice)) continue;

    const entry = candles[i].close;
    const exit = candles[i + 1].close;
    const returnPct = ((exit - entry) / entry) * 100;
    trades.push({ entry, exit, returnPct, win: returnPct > 0 });
  }

  if (trades.length === 0) {
    return {
      sampleSize: 0,
      winRate: 0,
      avgWinPct: 0,
      avgLossPct: 0,
      expectancyPct: 0,
      trades: [],
    };
  }

  const wins = trades.filter((t) => t.win);
  const losses = trades.filter((t) => !t.win);
  const winRate = (wins.length / trades.length) * 100;
  const avgWinPct =
    wins.length > 0 ? wins.reduce((s, t) => s + t.returnPct, 0) / wins.length : 0;
  const avgLossPct =
    losses.length > 0 ? losses.reduce((s, t) => s + t.returnPct, 0) / losses.length : 0;
  const expectancyPct = trades.reduce((s, t) => s + t.returnPct, 0) / trades.length;

  return {
    sampleSize: trades.length,
    winRate: Math.round(winRate * 10) / 10,
    avgWinPct: Math.round(avgWinPct * 100) / 100,
    avgLossPct: Math.round(avgLossPct * 100) / 100,
    expectancyPct: Math.round(expectancyPct * 100) / 100,
    trades: trades.slice(-10),
  };
}

/**
 * Next-session estimate — NOT a guarantee. Uses regime-aware momentum + ATR range.
 */
export function forecastNextDay(candles, stock = {}) {
  const weights = getLearningWeights();
  const closes = candles.map((c) => c.close);
  const lastClose = closes.at(-1) ?? stock.price ?? 0;
  const atr = computeATR(candles);
  const returns = dailyReturns(closes);

  const mom5 = avgMomentum(returns, 5);
  const mom10 = avgMomentum(returns, 10);
  const mom20 = totalReturnMomentum(closes, 20);

  const rsi = computeRSI(closes);
  const macd = computeMACD(closes);
  const sma20 = computeSMA(closes, 20);
  const sma50 = computeSMA(closes, 50);
  const regime = detectTrendRegime(closes, sma20, sma50, lastClose);
  const backtest = backtestSymbol(candles);

  const pullbackInUptrend =
    regime.goldenTrend && mom20 > 0.001 && mom5 < -0.003;

  let drift;
  if (pullbackInUptrend) {
    drift =
      (mom5 * weights.pullbackDamping * 0.3 +
        mom10 * 0.35 +
        mom20 * 0.35) *
      weights.momentumMultiplier;
  } else if (regime.goldenTrend) {
    drift = (mom5 * 0.35 + mom10 * 0.35 + mom20 * 0.3) * weights.momentumMultiplier;
  } else {
    drift = (mom5 * 0.5 + mom10 * 0.3 + mom20 * 0.2) * weights.momentumMultiplier;
  }

  if (rsi > 70) drift -= weights.rsiOverboughtPenalty;
  if (rsi > 70 && (stock.momentumScore ?? 0) > 4) {
    drift -= weights.rsiOverboughtPenalty * 1.5;
  }
  if (rsi < 35) drift += weights.rsiOversoldBoost;

  if (macd.trend === 'bullish') {
    drift += weights.macdBullishBoost;
  } else if (macd.trend === 'bearish') {
    let penalty = weights.macdBearishPenalty;
    if (regime.goldenTrend || regime.aboveSma50) {
      penalty *= weights.trendDamping ?? 0.35;
    }
    if (histogramRising(macd)) penalty *= 0.5;
    drift -= penalty;
  }

  if (regime.goldenTrend) drift += weights.trendAlignmentBoost ?? 0.0008;
  else if (regime.aboveSma50 && mom20 > 0) drift += (weights.trendAlignmentBoost ?? 0.0008) * 0.5;

  const pointEstimate = lastClose * (1 + drift);
  const atrMult = weights.atrMultiplier;
  const conflictingSignals = mom5 < -0.002 && mom20 > 0.002;
  const rangeMult = conflictingSignals || (macd.trend === 'bearish' && regime.goldenTrend) ? atrMult * 1.15 : atrMult;
  const lowEstimate = pointEstimate - atr * rangeMult;
  const highEstimate = pointEstimate + atr * rangeMult;

  const direction =
    drift > 0.0015 ? 'up' : drift < -0.0015 ? 'down' : 'flat';

  const historicalWinRate = backtest.winRate;
  let confidence = Math.min(
    95,
    Math.max(
      weights.confidenceFloor,
      Math.round(
        40 +
          historicalWinRate * 0.35 +
          (stock.momentumScore ?? 0) * 1.5 +
          (direction === 'up' && rsi < 65 ? 5 : 0) -
          (rsi > 72 && direction === 'up' ? 8 : 0)
      )
    )
  );

  if (conflictingSignals) confidence -= 10;
  if (macd.trend === 'bearish' && regime.goldenTrend) confidence -= 7;
  if (pullbackInUptrend && direction === 'down') confidence -= 8;
  if (regime.goldenTrend && direction === 'up') confidence += 3;
  if (rsi > 72 && direction === 'up' && (stock.momentumScore ?? 0) > 4) {
    confidence -= 18;
    drift -= weights.rsiOverboughtPenalty;
  }
  if (rsi > 70 && direction === 'up') {
    confidence = Math.min(confidence, weights.highConfidenceThreshold + 8);
  }
  confidence = Math.min(95, Math.max(weights.confidenceFloor, confidence));

  return {
    symbol: stock.symbol,
    currentPrice: Math.round(lastClose * 100) / 100,
    forecastDate: getNextTradingDayLabel(),
    pointEstimate: Math.round(pointEstimate * 100) / 100,
    lowEstimate: Math.round(lowEstimate * 100) / 100,
    highEstimate: Math.round(highEstimate * 100) / 100,
    expectedChangePct: Math.round(drift * 10000) / 100,
    direction,
    confidence,
    atr: Math.round(atr * 100) / 100,
    rsi,
    backtest,
    factors: {
      mom5: Math.round(mom5 * 10000) / 100,
      mom20: Math.round(mom20 * 10000) / 100,
      macdTrend: macd.trend,
      goldenTrend: regime.goldenTrend,
      pullbackInUptrend,
      conflictingSignals,
    },
    disclaimer:
      'Statistical estimate only — not financial advice. Past win rates do not guarantee future results.',
  };
}

export function simulateCompounding({
  startingCapital,
  winRatePct,
  avgWinPct,
  avgLossPct,
  tradesPerDay,
  days,
  positionPct = 100,
}) {
  const p = winRatePct / 100;
  const winMult = 1 + avgWinPct / 100;
  const lossMult = 1 + avgLossPct / 100;
  const pos = positionPct / 100;

  let capital = startingCapital;
  const curve = [{ day: 0, capital: Math.round(capital * 100) / 100 }];

  for (let d = 1; d <= days; d++) {
    for (let t = 0; t < tradesPerDay; t++) {
      const bet = capital * pos;
      const expectedReturn = p * (winMult - 1) + (1 - p) * (lossMult - 1);
      capital += bet * expectedReturn;
    }
    curve.push({ day: d, capital: Math.round(capital * 100) / 100 });
  }

  const pessimisticP = Math.max(0, p - 0.1);
  const optimisticP = Math.min(1, p + 0.08);
  let pessimistic = startingCapital;
  let optimistic = startingCapital;
  const totalTrades = days * tradesPerDay;

  for (let i = 0; i < totalTrades; i++) {
    const betP = pessimistic * pos;
    pessimistic += betP * (pessimisticP * (winMult - 1) + (1 - pessimisticP) * (lossMult - 1));
    const betO = optimistic * pos;
    optimistic += betO * (optimisticP * (winMult - 1) + (1 - optimisticP) * (lossMult - 1));
  }

  return {
    startingCapital,
    endingCapital: Math.round(capital * 100) / 100,
    totalReturnPct: Math.round(((capital - startingCapital) / startingCapital) * 10000) / 100,
    pessimisticEnding: Math.round(pessimistic * 100) / 100,
    optimisticEnding: Math.round(optimistic * 100) / 100,
    curve,
    assumptions: { winRatePct, avgWinPct, avgLossPct, tradesPerDay, days, positionPct },
    disclaimer:
      'Hypothetical projection using historical win rate — NOT guaranteed. Real trading includes fees, slippage, and black swan events.',
  };
}

function getNextTradingDayLabel() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
