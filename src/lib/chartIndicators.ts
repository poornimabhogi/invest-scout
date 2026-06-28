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
}

function emaSeries(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  let ema: number | null = null;

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    if (ema === null) {
      ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    } else {
      ema = values[i] * k + ema * (1 - k);
    }
    result.push(ema);
  }
  return result;
}

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
    };
  }

  const fast = emaSeries(closes, fastPeriod);
  const slow = emaSeries(closes, slowPeriod);
  const macdLine = closes.map((_, i) =>
    fast[i] != null && slow[i] != null ? fast[i]! - slow[i]! : null
  );

  const macdValues: number[] = [];
  const macdIndices: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] != null) {
      macdValues.push(macdLine[i]!);
      macdIndices.push(i);
    }
  }

  const signalEma = emaSeries(macdValues, signalPeriod);
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  for (let j = 0; j < signalEma.length; j++) {
    if (signalEma[j] != null) signalLine[macdIndices[j]] = signalEma[j];
  }

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
  };
}
