/**
 * Williams Vix Fix [Chris Moody / Larry Williams concept]
 * CM_Williams_Vix_Fix — capitulation / potential bottom detector
 */

import { countCoreBullishIndicators } from './chartIndicatorAudit.js';

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

export function computeWilliamsVixFix(
  candles,
  {
    pd = 22,
    bbl = 20,
    mult = 2.0,
    lb = 50,
    ph = 0.85,
    pl = 1.01,
  } = {}
) {
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
  const wvfSeries = [];

  for (let i = 0; i < candles.length; i++) {
    const hc = highestAt(closes, i, pd);
    const low = lows[i];
    if (hc == null || hc <= 0) {
      wvfSeries.push(null);
    } else {
      wvfSeries.push(((hc - low) / hc) * 100);
    }
  }

  const series = [];
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

  const last = series.at(-1);
  const prev = series.at(-2);
  const prev2 = series.at(-3);
  const val = last?.value ?? null;

  let capitulation = Boolean(last?.extreme);
  let fearEasing = false;
  const signals = [];

  if (val != null) {
    const hadExtreme =
      prev?.extreme || prev2?.extreme || (prev?.value != null && prev.value > (prev?.upperBand ?? Infinity));
    if (capitulation) {
      signals.push('WVF capitulation spike — fear extreme, watch for potential low');
    }
    if (hadExtreme && prev?.value != null && val < prev.value && val > (last?.midLine ?? 0)) {
      fearEasing = true;
      signals.push('WVF fear easing — capitulation may be exhausting');
    }
    if (!capitulation && !fearEasing && val > (last?.midLine ?? 0) * 1.2) {
      signals.push('Elevated WVF — elevated downside volatility');
    }
  }

  let recommendation = 'watch';
  if (capitulation || fearEasing) recommendation = 'buy';

  return {
    value: val != null ? Math.round(val * 100) / 100 : null,
    upperBand: last?.upperBand != null ? Math.round(last.upperBand * 100) / 100 : null,
    rangeHigh: last?.rangeHigh != null ? Math.round(last.rangeHigh * 100) / 100 : null,
    rangeLow: last?.rangeLow != null ? Math.round(last.rangeLow * 100) / 100 : null,
    capitulation,
    fearEasing,
    extreme: capitulation,
    recommendation,
    series,
    signals,
    params: { pd, bbl, mult, lb, ph, pl },
  };
}

export function wvfCapitulationQualifies(wvf, { minCoreBullish = 4, checks = null } = {}) {
  if (!wvf?.capitulation && !wvf?.fearEasing) return false;
  if (!checks) return true;
  return countCoreBullishIndicators(checks) >= minCoreBullish;
}
