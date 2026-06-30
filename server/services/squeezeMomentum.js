/**
 * Squeeze Momentum [LazyBear] — server-side (mirrors src/lib/chartIndicators.ts)
 * Attribution: LazyBear / TradingView community script
 */

function smaAt(values, endIdx, period) {
  if (endIdx < period - 1) return null;
  let sum = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) sum += values[i];
  return sum / period;
}

function stdevAt(values, endIdx, period) {
  const mean = smaAt(values, endIdx, period);
  if (mean == null) return null;
  let sumSq = 0;
  for (let i = endIdx - period + 1; i <= endIdx; i++) {
    const d = values[i] - mean;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / period);
}

function highestAt(values, endIdx, period) {
  if (endIdx < period - 1) return null;
  let max = -Infinity;
  for (let i = endIdx - period + 1; i <= endIdx; i++) max = Math.max(max, values[i]);
  return max;
}

function lowestAt(values, endIdx, period) {
  if (endIdx < period - 1) return null;
  let min = Infinity;
  for (let i = endIdx - period + 1; i <= endIdx; i++) min = Math.min(min, values[i]);
  return min;
}

function trueRangeAt(candles, idx) {
  const c = candles[idx];
  if (idx === 0) return c.high - c.low;
  const prev = candles[idx - 1].close;
  return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
}

function linregAt(values, endIdx, length, offset = 0) {
  if (endIdx < length - 1) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let j = 0; j < length; j++) {
    const x = j;
    const y = values[endIdx - length + 1 + j];
    if (y == null || Number.isNaN(y)) return null;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  const denom = length * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (length * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / length;
  return intercept + slope * (length - 1 - offset);
}

export function computeSqueezeMomentum(candles, bbLength = 20, bbMult = 2.0, kcLength = 20, kcMult = 1.5, useTrueRange = true) {
  const minBars = Math.max(bbLength, kcLength) + 5;
  if (!candles?.length || candles.length < minBars) {
    return {
      value: null,
      squeezeOn: false,
      squeezeOff: false,
      noSqueeze: true,
      momentum: 'insufficient',
      trend: 'insufficient',
      series: [],
      signals: [],
      params: { bbLength, bbMult, kcLength, kcMult },
    };
  }

  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const rangeSeries = candles.map((c, idx) =>
    useTrueRange ? trueRangeAt(candles, idx) : c.high - c.low
  );

  const midpointSeries = [];
  for (let i = 0; i < candles.length; i++) {
    const hh = highestAt(highs, i, kcLength);
    const ll = lowestAt(lows, i, kcLength);
    const ma = smaAt(closes, i, kcLength);
    if (hh == null || ll == null || ma == null) {
      midpointSeries.push(null);
    } else {
      midpointSeries.push(closes[i] - ((hh + ll) / 2 + ma) / 2);
    }
  }

  const series = [];
  let prevVal = null;

  for (let i = 0; i < candles.length; i++) {
    const basis = smaAt(closes, i, bbLength);
    const dev = basis != null ? bbMult * stdevAt(closes, i, bbLength) : null;
    const upperBB = basis != null && dev != null ? basis + dev : null;
    const lowerBB = basis != null && dev != null ? basis - dev : null;

    const ma = smaAt(closes, i, kcLength);
    const rangeMa = smaAt(rangeSeries, i, kcLength);
    const upperKC = ma != null && rangeMa != null ? ma + rangeMa * kcMult : null;
    const lowerKC = ma != null && rangeMa != null ? ma - rangeMa * kcMult : null;

    const sqzOn =
      lowerBB != null && lowerKC != null && upperBB != null && upperKC != null
        ? lowerBB > lowerKC && upperBB < upperKC
        : false;
    const sqzOff =
      lowerBB != null && lowerKC != null && upperBB != null && upperKC != null
        ? lowerBB < lowerKC && upperBB > upperKC
        : false;
    const noSqz = !sqzOn && !sqzOff;

    const val = linregAt(midpointSeries, i, kcLength, 0);

    let barColor = '#888888';
    if (val != null) {
      if (val > 0) barColor = prevVal != null && val > prevVal ? '#00ff00' : '#008000';
      else barColor = prevVal != null && val < prevVal ? '#ff0000' : '#800000';
    }

    const zeroColor = noSqz ? '#0000ff' : sqzOn ? '#000000' : '#808080';

    series.push({ value: val, squeezeOn: sqzOn, squeezeOff: sqzOff, noSqueeze: noSqz, barColor, zeroColor });
    prevVal = val;
  }

  const last = series.at(-1);
  const prev = series.at(-2);
  const val = last?.value ?? null;
  const prevValLast = prev?.value ?? null;

  const signals = [];
  let momentum = 'neutral';
  let trend = 'decelerating';

  if (val != null && last) {
    momentum = val > 0 ? 'bullish' : val < 0 ? 'bearish' : 'neutral';
    if (prevValLast != null) {
      if (val > 0 && val > prevValLast) trend = 'accelerating_up';
      else if (val < 0 && val < prevValLast) trend = 'accelerating_down';
      else trend = 'decelerating';
    }

    if (last.squeezeOn) signals.push('Squeeze ON — volatility compressed, breakout building');
    if (last.squeezeOff && prev?.squeezeOn) signals.push('Squeeze FIRED — volatility expanding, move starting');
    if (last.squeezeOff && val > 0 && trend === 'accelerating_up') {
      signals.push('Squeeze fired with bullish momentum — strong long setup');
    }
    if (last.squeezeOff && val < 0 && trend === 'accelerating_down') {
      signals.push('Squeeze fired with bearish momentum — avoid longs');
    }
    if (val > 0 && trend === 'accelerating_up' && !last.squeezeOn) {
      signals.push('Momentum histogram rising — bullish pressure increasing');
    }
    if (val < 0 && trend === 'accelerating_down') {
      signals.push('Momentum histogram falling — bearish pressure increasing');
    }
  }

  return {
    value: val != null ? Math.round(val * 1000) / 1000 : null,
    squeezeOn: last?.squeezeOn ?? false,
    squeezeOff: last?.squeezeOff ?? false,
    noSqueeze: last?.noSqueeze ?? true,
    momentum,
    trend,
    series,
    signals,
    params: { bbLength, bbMult, kcLength, kcMult },
  };
}
