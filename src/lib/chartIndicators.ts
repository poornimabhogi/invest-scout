import { Candle } from '@/types/chart';

export interface MacdPoint {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}

export interface MacdResult {
  macd: number | null;
  signal: number | null;
  histogram: number | null;
  trend: 'bullish' | 'bearish' | 'neutral' | 'insufficient';
  series: MacdPoint[];
  params?: { fast: number; slow: number; signal: number };
}

/** TradingView-compatible EMA (Pine ta.ema): SMA seed, then exponential smooth */
function emaPine(values: (number | null)[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  let ema: number | null = null;

  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (val == null || Number.isNaN(val)) {
      result.push(null);
      continue;
    }
    if (ema === null) {
      if (i < period - 1) {
        result.push(null);
        continue;
      }
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += values[j]!;
      ema = sum / period;
      result.push(ema);
    } else {
      ema = k * val + (1 - k) * ema;
      result.push(ema);
    }
  }
  return result;
}

/**
 * MACD(12, 26, 9) — Fast EMA 12, Slow EMA 26, Signal EMA 9 (TradingView default).
 * The "9" is signal smoothing, NOT the slow period.
 */
export function computeMACD(
  candles: Candle[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MacdResult {
  const closes = candles.map((c) => c.close);
  if (closes.length < slowPeriod + signalPeriod) {
    return {
      macd: null,
      signal: null,
      histogram: null,
      trend: 'insufficient',
      series: [],
      params: { fast: fastPeriod, slow: slowPeriod, signal: signalPeriod },
    };
  }

  const fast = emaPine(closes, fastPeriod);
  const slow = emaPine(closes, slowPeriod);
  const macdLine = closes.map((_, i) =>
    fast[i] != null && slow[i] != null ? fast[i]! - slow[i]! : null
  );
  const signalLine = emaPine(macdLine, signalPeriod);

  const histogram = closes.map((_, i) =>
    macdLine[i] != null && signalLine[i] != null ? macdLine[i]! - signalLine[i]! : null
  );

  const series = closes.map((_, i) => ({
    macd: macdLine[i],
    signal: signalLine[i],
    histogram: histogram[i],
  }));

  const last = closes.length - 1;
  const macd = macdLine[last];
  const signal = signalLine[last];
  const hist = histogram[last];

  let trend: MacdResult['trend'] = 'neutral';
  if (macd != null && signal != null && hist != null) {
    if (hist > 0 && macd > signal) trend = 'bullish';
    else if (hist < 0 && macd < signal) trend = 'bearish';
  }

  return {
    macd: macd != null ? Math.round(macd * 1000) / 1000 : null,
    signal: signal != null ? Math.round(signal * 1000) / 1000 : null,
    histogram: hist != null ? Math.round(hist * 1000) / 1000 : null,
    trend,
    series,
    params: { fast: fastPeriod, slow: slowPeriod, signal: signalPeriod },
  };
}

/** LazyBear Squeeze Momentum — BB vs Keltner squeeze + linreg momentum histogram */
export interface SqueezePoint {
  value: number | null;
  squeezeOn: boolean;
  squeezeOff: boolean;
  noSqueeze: boolean;
  barColor: string;
  zeroColor: string;
}

export interface SqueezeResult {
  value: number | null;
  squeezeOn: boolean;
  squeezeOff: boolean;
  noSqueeze: boolean;
  momentum: 'bullish' | 'bearish' | 'neutral' | 'insufficient';
  trend: 'accelerating_up' | 'accelerating_down' | 'decelerating' | 'insufficient';
  series: SqueezePoint[];
  signals: string[];
  params: { bbLength: number; bbMult: number; kcLength: number; kcMult: number };
}

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

/** Pine-compatible linreg(source, length, offset) at bar index */
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

/**
 * Squeeze Momentum [LazyBear] — detects volatility compression (squeeze) and momentum direction.
 * Attribution: LazyBear / TradingView community script.
 */
export function computeSqueezeMomentum(
  candles: Candle[],
  bbLength = 20,
  bbMult = 2.0,
  kcLength = 20,
  kcMult = 1.5,
  useTrueRange = true
): SqueezeResult {
  const minBars = Math.max(bbLength, kcLength) + 5;
  if (candles.length < minBars) {
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

  const midpointSeries: (number | null)[] = [];
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

  const series: SqueezePoint[] = [];
  let prevVal: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const basis = smaAt(closes, i, bbLength);
    const dev = basis != null ? bbMult * stdevAt(closes, i, bbLength) : null;
    const upperBB = basis != null && dev != null ? basis + dev : null;
    const lowerBB = basis != null && dev != null ? basis - dev : null;

    const ma = smaAt(closes, i, kcLength);
    const rangeVal = useTrueRange ? trueRangeAt(candles, i) : candles[i].high - candles[i].low;
    const rangeMa = smaAt(
      candles.map((c, idx) => (useTrueRange ? trueRangeAt(candles, idx) : c.high - c.low)),
      i,
      kcLength
    );
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

    series.push({
      value: val,
      squeezeOn: sqzOn,
      squeezeOff: sqzOff,
      noSqueeze: noSqz,
      barColor,
      zeroColor,
    });

    prevVal = val;
  }

  const last = series.at(-1)!;
  const prev = series.at(-2);
  const val = last.value;
  const prevValLast = prev?.value ?? null;

  const signals: string[] = [];
  let momentum: SqueezeResult['momentum'] = 'neutral';
  let trend: SqueezeResult['trend'] = 'decelerating';

  if (val != null) {
    momentum = val > 0 ? 'bullish' : val < 0 ? 'bearish' : 'neutral';
    if (prevValLast != null) {
      if (val > 0 && val > prevValLast) trend = 'accelerating_up';
      else if (val < 0 && val < prevValLast) trend = 'accelerating_down';
      else trend = 'decelerating';
    }

    if (last.squeezeOn) {
      signals.push('Squeeze ON — volatility compressed, breakout building');
    }
    if (last.squeezeOff && prev?.squeezeOn) {
      signals.push('Squeeze FIRED — volatility expanding, move starting');
    }
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
    squeezeOn: last.squeezeOn,
    squeezeOff: last.squeezeOff,
    noSqueeze: last.noSqueeze,
    momentum,
    trend,
    series,
    signals,
    params: { bbLength, bbMult, kcLength, kcMult },
  };
}

export interface WvfPoint {
  value: number | null;
  midLine: number | null;
  upperBand: number | null;
  lowerBand: number | null;
  rangeHigh: number | null;
  rangeLow: number | null;
  extreme: boolean;
  barColor: string;
}

export interface WvfResult {
  value: number | null;
  upperBand: number | null;
  rangeHigh: number | null;
  rangeLow: number | null;
  capitulation: boolean;
  fearEasing: boolean;
  extreme: boolean;
  recommendation: 'buy' | 'watch';
  series: WvfPoint[];
  signals: string[];
  params: { pd: number; bbl: number; mult: number; lb: number; ph: number; pl: number };
}

export function computeWilliamsVixFix(
  candles: Candle[],
  { pd = 22, bbl = 20, mult = 2.0, lb = 50, ph = 0.85, pl = 1.01 } = {}
): WvfResult {
  const minBars = Math.max(pd, bbl, lb) + 5;
  if (!candles?.length || candles.length < minBars) {
    return {
      value: null,
      upperBand: null,
      rangeHigh: null,
      rangeLow: null,
      capitulation: false,
      fearEasing: false,
      extreme: false,
      recommendation: 'watch',
      series: [],
      signals: [],
      params: { pd, bbl, mult, lb, ph, pl },
    };
  }

  const closes = candles.map((c) => c.close);
  const lows = candles.map((c) => c.low);
  const wvfSeries: (number | null)[] = [];

  for (let i = 0; i < candles.length; i++) {
    const hc = highestAt(closes, i, pd);
    const low = lows[i];
    if (hc == null || hc <= 0) wvfSeries.push(null);
    else wvfSeries.push(((hc - low) / hc) * 100);
  }

  const series: WvfPoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    const wvf = wvfSeries[i];
    const midLine = smaAt(wvfSeries, i, bbl);
    const sDev = stdevAt(wvfSeries, i, bbl);
    const upperBand = midLine != null && sDev != null ? midLine + mult * sDev : null;
    const lowerBand = midLine != null && sDev != null ? midLine - mult * sDev : null;
    const hiWvf = highestAt(wvfSeries, i, lb);
    const loWvf = lowestAt(wvfSeries, i, lb);
    const rangeHigh = hiWvf != null ? hiWvf * ph : null;
    const rangeLow = loWvf != null ? loWvf * pl : null;
    const extreme =
      wvf != null &&
      ((upperBand != null && wvf >= upperBand) || (rangeHigh != null && wvf >= rangeHigh));

    series.push({
      value: wvf,
      midLine,
      upperBand,
      lowerBand,
      rangeHigh,
      rangeLow,
      extreme,
      barColor: extreme ? '#84cc16' : '#9ca3af',
    });
  }

  const last = series.at(-1)!;
  const prev = series.at(-2);
  const prev2 = series.at(-3);
  const val = last?.value ?? null;
  const capitulation = Boolean(last?.extreme);
  let fearEasing = false;
  const signals: string[] = [];

  if (val != null) {
    const hadExtreme = prev?.extreme || prev2?.extreme;
    if (capitulation) signals.push('WVF capitulation spike — fear extreme, watch for potential low');
    if (hadExtreme && prev?.value != null && val < prev.value && val > (last?.midLine ?? 0)) {
      fearEasing = true;
      signals.push('WVF fear easing — capitulation may be exhausting');
    }
  }

  return {
    value: val != null ? Math.round(val * 100) / 100 : null,
    upperBand: last?.upperBand != null ? Math.round(last.upperBand * 100) / 100 : null,
    rangeHigh: last?.rangeHigh != null ? Math.round(last.rangeHigh * 100) / 100 : null,
    rangeLow: last?.rangeLow != null ? Math.round(last.rangeLow * 100) / 100 : null,
    capitulation,
    fearEasing,
    extreme: capitulation,
    recommendation: capitulation || fearEasing ? 'buy' : 'watch',
    series,
    signals,
    params: { pd, bbl, mult, lb, ph, pl },
  };
}
