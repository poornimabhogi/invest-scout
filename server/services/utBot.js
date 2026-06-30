/**
 * UT Bot Alerts — ATR trailing stop (Pine v4 port)
 * Key Value × ATR trailing stop with crossover buy/sell signals.
 */

function rma(values, period) {
  if (!values.length) return [];
  const out = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      sum += values[i];
      out.push(i === period - 1 ? sum / period : null);
    } else if (i === period - 1) {
      sum += values[i];
      const first = sum / period;
      out.push(first);
    } else {
      const prev = out[i - 1];
      out.push((prev * (period - 1) + values[i]) / period);
    }
  }
  return out;
}

function computeAtrSeries(candles, period = 10) {
  const trs = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prev = candles[i - 1];
    return Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  });
  return rma(trs, period);
}

function emaSeries(values, period) {
  const k = 2 / (period + 1);
  const out = [];
  let ema = null;
  for (const val of values) {
    if (ema == null) ema = val;
    else ema = k * val + (1 - k) * ema;
    out.push(ema);
  }
  return out;
}

function crossover(prevA, prevB, a, b) {
  return prevA <= prevB && a > b;
}

export function analyzeUtBot(candles, keyValue = 1, atrPeriod = 10) {
  if (!candles?.length || candles.length < atrPeriod + 5) {
    return {
      attribution: 'UT Bot Alerts (ATR trailing stop)',
      position: 'neutral',
      signal: 'none',
      trailingStop: null,
      utScore: 0,
      recommendation: 'watch',
      signals: ['Insufficient history for UT Bot'],
      lastBuy: null,
      lastSell: null,
      overlay: { markers: [], priceLines: [] },
    };
  }

  const atrSeries = computeAtrSeries(candles, atrPeriod);
  const closes = candles.map((c) => c.close);
  const ema1 = emaSeries(closes, 1);

  let trailingStop = 0;
  let pos = 0;
  const events = [];

  for (let i = 1; i < candles.length; i++) {
    const src = closes[i];
    const prevSrc = closes[i - 1];
    const xATR = atrSeries[i] ?? atrSeries[i - 1] ?? 0;
    const nLoss = keyValue * xATR;
    const prevStop = trailingStop;

    if (src > prevStop && prevSrc > prevStop) {
      trailingStop = Math.max(prevStop, src - nLoss);
    } else if (src < prevStop && prevSrc < prevStop) {
      trailingStop = Math.min(prevStop, src + nLoss);
    } else if (src > prevStop) {
      trailingStop = src - nLoss;
    } else {
      trailingStop = src + nLoss;
    }

    const prevPos = pos;
    if (prevSrc < prevStop && src > trailingStop) pos = 1;
    else if (prevSrc > prevStop && src < trailingStop) pos = -1;
    else pos = prevPos;

    const above = crossover(ema1[i - 1], prevStop, ema1[i], trailingStop);
    const below = crossover(prevStop, ema1[i - 1], trailingStop, ema1[i]);
    const buy = src > trailingStop && above;
    const sell = src < trailingStop && below;

    if (buy) {
      events.push({ type: 'buy', time: candles[i].time, price: src, barIndex: i });
    }
    if (sell) {
      events.push({ type: 'sell', time: candles[i].time, price: src, barIndex: i });
    }
  }

  const last = candles.at(-1);
  const lastClose = last.close;
  const lastStop = trailingStop;
  const lastEvent = events.at(-1);
  const barsSinceEvent = lastEvent ? candles.length - 1 - lastEvent.barIndex : Infinity;

  const position = pos === 1 ? 'long' : pos === -1 ? 'short' : lastClose > lastStop ? 'long' : 'short';
  const signal = lastEvent?.type ?? 'none';

  const signals = [];
  let utScore = 0;

  if (lastClose > lastStop) {
    utScore += 2;
    signals.push('UT Bot long — price above ATR trailing stop');
  } else {
    utScore -= 2;
    signals.push('UT Bot short — price below ATR trailing stop');
  }

  if (lastEvent?.type === 'buy' && barsSinceEvent <= 5) {
    utScore += 4;
    signals.push(`Fresh UT Bot buy signal (${barsSinceEvent} bars ago)`);
  } else if (lastEvent?.type === 'sell' && barsSinceEvent <= 5) {
    utScore -= 4;
    signals.push(`Fresh UT Bot sell signal (${barsSinceEvent} bars ago)`);
  }

  let recommendation = 'watch';
  if (utScore >= 4 && position === 'long') recommendation = 'buy';
  else if (utScore <= -2 || position === 'short') recommendation = 'avoid';

  const markers = events.slice(-8).map((e) => ({
    time: e.time,
    position: e.type === 'buy' ? 'belowBar' : 'aboveBar',
    color: e.type === 'buy' ? '#22c55e' : '#ef4444',
    shape: e.type === 'buy' ? 'arrowUp' : 'arrowDown',
    text: e.type === 'buy' ? 'UT Buy' : 'UT Sell',
  }));

  const priceLines = [
    {
      price: Math.round(lastStop * 100) / 100,
      color: position === 'long' ? '#22c55e88' : '#ef444488',
      title: 'UT Stop',
    },
  ];

  return {
    attribution: 'UT Bot Alerts (ATR trailing stop)',
    position,
    signal,
    trailingStop: Math.round(lastStop * 100) / 100,
    keyValue,
    atrPeriod,
    utScore: Math.round(utScore * 10) / 10,
    recommendation,
    signals,
    lastBuy: events.filter((e) => e.type === 'buy').at(-1) ?? null,
    lastSell: events.filter((e) => e.type === 'sell').at(-1) ?? null,
    recentEvents: events.slice(-10),
    overlay: { markers, priceLines },
  };
}

/** Confluence helper used by scoring and top-pick gates */
export function buildStructureConfluence(strategy) {
  if (!strategy) return null;

  const smc =
    strategy.smcRecommendation === 'buy' ||
    strategy.smcTrend === 'bullish' ||
    strategy.smcZone === 'discount';

  const msb = strategy.msbRecommendation === 'buy' || strategy.msbMarket === 'bullish';

  const squeeze = (strategy.chartSignals ?? []).some((s) =>
    /Squeeze fired|squeeze.*bullish|momentum building/i.test(s)
  );

  const utBot =
    strategy.utBotRecommendation === 'buy' ||
    strategy.utBotPosition === 'long' ||
    strategy.utBotSignal === 'buy';

  const ote =
    strategy.oteRecommendation === 'buy' ||
    (strategy.oteInZone && strategy.oteBias === 'bullish');

  const dualStructure = smc && msb;
  const tripleConfluence = dualStructure && utBot;
  const premiumEntry = dualStructure && ote;

  return { smc, msb, squeeze, utBot, ote, dualStructure, tripleConfluence, premiumEntry };
}
