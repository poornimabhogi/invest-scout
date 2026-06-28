/**
 * Smart Money Concepts analysis — algorithm inspired by LuxAlgo SMC (CC BY-NC-SA 4.0)
 * © LuxAlgo — https://creativecommons.org/licenses/by-nc-sa/4.0/
 * Ported for local research signals (BOS, CHoCH, order blocks, FVG, premium/discount).
 */

const BULLISH = 1;
const BEARISH = -1;

function atr(candles, period = 200) {
  if (candles.length < 2) return candles.at(-1)?.close * 0.02 ?? 1;
  const trs = [];
  const start = Math.max(1, candles.length - period);
  for (let i = start; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)));
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

function parsedBar(candle, atrVal) {
  const volatile = candle.high - candle.low >= 2 * atrVal;
  return {
    parsedHigh: volatile ? candle.low : candle.high,
    parsedLow: volatile ? candle.high : candle.low,
  };
}

function computeLeg(candles, i, size) {
  if (i < size) return null;
  const refHi = candles[i - size].high;
  const refLo = candles[i - size].low;
  let highest = -Infinity;
  let lowest = Infinity;
  for (let j = i - size + 1; j <= i; j++) {
    highest = Math.max(highest, candles[j].high);
    lowest = Math.min(lowest, candles[j].low);
  }
  if (refHi > highest) return 0;
  if (refLo < lowest) return 1;
  return null;
}

function createPivot() {
  return { currentLevel: null, lastLevel: null, crossed: false, barIndex: 0, time: 0 };
}

function runStructure(candles, parsedHighs, parsedLows, size, internal = false) {
  const signals = [];
  const orderBlocks = [];
  let swingHigh = createPivot();
  let swingLow = createPivot();
  let trend = 0;

  for (let i = size; i < candles.length; i++) {
    const leg = computeLeg(candles, i, size);
    const prevLeg = i > size ? computeLeg(candles, i - 1, size) : null;
    const newLeg = leg !== null && leg !== prevLeg;

    if (newLeg) {
      if (leg === 1) {
        const p = swingLow;
        p.lastLevel = p.currentLevel;
        p.currentLevel = candles[i - size].low;
        p.crossed = false;
        p.barIndex = i - size;
        p.time = candles[i - size].time;
      } else {
        const p = swingHigh;
        p.lastLevel = p.currentLevel;
        p.currentLevel = candles[i - size].high;
        p.crossed = false;
        p.barIndex = i - size;
        p.time = candles[i - size].time;
      }
    }

    const close = candles[i].close;

    if (swingHigh.currentLevel != null && close > swingHigh.currentLevel && !swingHigh.crossed) {
      const tag = trend === BEARISH ? 'CHoCH' : 'BOS';
      trend = BULLISH;
      swingHigh.crossed = true;
      signals.push({
        type: tag,
        bias: 'bullish',
        structure: internal ? 'internal' : 'swing',
        price: swingHigh.currentLevel,
        time: candles[i].time,
        barIndex: i,
      });

      const slice = parsedHighs.slice(swingHigh.barIndex, i + 1);
      let maxIdx = 0;
      let maxVal = -Infinity;
      for (let k = 0; k < slice.length; k++) {
        if (slice[k] > maxVal) {
          maxVal = slice[k];
          maxIdx = k;
        }
      }
      const obIdx = swingHigh.barIndex + maxIdx;
      orderBlocks.unshift({
        bias: 'bullish',
        high: candles[obIdx].high,
        low: candles[obIdx].low,
        time: candles[obIdx].time,
        mitigated: false,
      });
    }

    if (swingLow.currentLevel != null && close < swingLow.currentLevel && !swingLow.crossed) {
      const tag = trend === BULLISH ? 'CHoCH' : 'BOS';
      trend = BEARISH;
      swingLow.crossed = true;
      signals.push({
        type: tag,
        bias: 'bearish',
        structure: internal ? 'internal' : 'swing',
        price: swingLow.currentLevel,
        time: candles[i].time,
        barIndex: i,
      });

      const slice = parsedLows.slice(swingLow.barIndex, i + 1);
      let minIdx = 0;
      let minVal = Infinity;
      for (let k = 0; k < slice.length; k++) {
        if (slice[k] < minVal) {
          minVal = slice[k];
          minIdx = k;
        }
      }
      const obIdx = swingLow.barIndex + minIdx;
      orderBlocks.unshift({
        bias: 'bearish',
        high: candles[obIdx].high,
        low: candles[obIdx].low,
        time: candles[obIdx].time,
        mitigated: false,
      });
    }
  }

  return { signals, orderBlocks, trend, swingHigh, swingLow };
}

function detectFairValueGaps(candles, atrVal) {
  const gaps = [];
  if (candles.length < 3) return gaps;

  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2];
    const c1 = candles[i - 1];
    const c2 = candles[i];
    const barDelta = Math.abs((c1.close - c1.open) / (c1.open || 1)) * 100;
    const threshold = atrVal / (c1.close || 1) * 50;

    if (c2.low > c0.high && c1.close > c0.high && barDelta > threshold) {
      gaps.push({
        bias: 'bullish',
        top: c2.low,
        bottom: c0.high,
        time: c1.time,
        filled: c2.low <= c0.high,
      });
    }
    if (c2.high < c0.low && c1.close < c0.low && barDelta > threshold) {
      gaps.push({
        bias: 'bearish',
        top: c0.low,
        bottom: c2.high,
        time: c1.time,
        filled: c2.high >= c0.low,
      });
    }
  }

  return gaps.filter((g) => !g.filled).slice(-8);
}

function activeOrderBlocks(orderBlocks, lastClose, lastHigh, lastLow) {
  return orderBlocks
    .filter((ob) => {
      if (ob.bias === 'bullish') return lastLow >= ob.low * 0.995;
      return lastHigh <= ob.high * 1.005;
    })
    .slice(0, 5);
}

function priceZone(price, top, bottom) {
  if (top == null || bottom == null || top === bottom) return 'equilibrium';
  const premium = 0.95 * top + 0.05 * bottom;
  const discount = 0.95 * bottom + 0.05 * top;
  if (price >= premium) return 'premium';
  if (price <= discount) return 'discount';
  return 'equilibrium';
}

function buildSmcScore({ trend, zone, recentSignals, activeOBs, fvgs, lastClose, lastBarIndex }) {
  let score = 0;
  const signals = [];

  if (trend === BULLISH) {
    score += 3;
    signals.push('Swing structure bullish');
  } else if (trend === BEARISH) {
    score -= 3;
    signals.push('Swing structure bearish');
  }

  if (zone === 'discount') {
    score += 4;
    signals.push('Price in discount zone — smart money accumulation area');
  } else if (zone === 'premium') {
    score -= 2;
    signals.push('Price in premium zone — extended, caution on new longs');
  }

  const recentBull = recentSignals.filter(
    (s) => s.bias === 'bullish' && s.structure === 'swing' && s.barIndex >= lastBarIndex - 15
  );
  for (const s of recentBull.slice(-2)) {
    score += s.type === 'CHoCH' ? 4 : 3;
    signals.push(`Bullish ${s.type} (${s.structure}) — trend shift / continuation`);
  }

  const recentBear = recentSignals.filter((s) => s.bias === 'bearish' && s.structure === 'swing').slice(-1);
  if (recentBear.length) score -= 2;

  const bullOb = activeOBs.find((ob) => ob.bias === 'bullish' && lastClose >= ob.low && lastClose <= ob.high * 1.02);
  if (bullOb) {
    score += 3;
    signals.push('Price reacting at bullish order block');
  }

  const bullFvg = fvgs.find((g) => g.bias === 'bullish' && lastClose >= g.bottom && lastClose <= g.top);
  if (bullFvg) {
    score += 2;
    signals.push('Price inside bullish fair value gap');
  }

  let recommendation = 'watch';
  if (score >= 8) recommendation = 'buy';
  else if (score <= -2) recommendation = 'avoid';

  return { score: Math.round(score * 10) / 10, recommendation, signals };
}

export function analyzeSmartMoneyConcepts(candles, options = {}) {
  if (!candles?.length || candles.length < 60) {
    return {
      attribution: 'LuxAlgo Smart Money Concepts (CC BY-NC-SA 4.0)',
      trend: 'neutral',
      zone: 'equilibrium',
      smcScore: 0,
      recommendation: 'watch',
      signals: ['Insufficient candle history for SMC'],
      structureSignals: [],
      orderBlocks: [],
      fairValueGaps: [],
      zones: null,
      overlay: { markers: [], priceLines: [] },
    };
  }

  const swingLength = options.swingLength ?? 50;
  const internalLength = options.internalLength ?? 5;
  const atrVal = atr(candles, Math.min(200, candles.length - 1));

  const parsedHighs = candles.map((c) => parsedBar(c, atrVal).parsedHigh);
  const parsedLows = candles.map((c) => parsedBar(c, atrVal).parsedLow);

  const swing = runStructure(candles, parsedHighs, parsedLows, Math.min(swingLength, Math.floor(candles.length / 3)), false);
  const internal = runStructure(candles, parsedHighs, parsedLows, internalLength, true);

  const fvgs = detectFairValueGaps(candles, atrVal);
  const last = candles.at(-1);
  const trailingTop = swing.swingHigh.currentLevel ?? Math.max(...candles.slice(-swingLength).map((c) => c.high));
  const trailingBottom = swing.swingLow.currentLevel ?? Math.min(...candles.slice(-swingLength).map((c) => c.low));
  const zone = priceZone(last.close, trailingTop, trailingBottom);

  const allOBs = [...swing.orderBlocks, ...internal.orderBlocks];
  const activeOBs = activeOrderBlocks(allOBs, last.close, last.high, last.low);

  const recentSignals = [...swing.signals, ...internal.signals].sort((a, b) => a.barIndex - b.barIndex);
  const { score, recommendation, signals } = buildSmcScore({
    trend: swing.trend,
    zone,
    recentSignals,
    activeOBs,
    fvgs,
    lastClose: last.close,
    lastBarIndex: candles.length - 1,
  });

  const markers = recentSignals.slice(-12).map((s) => ({
    time: s.time,
    position: s.bias === 'bullish' ? 'belowBar' : 'aboveBar',
    color: s.bias === 'bullish' ? '#089981' : '#F23645',
    shape: s.bias === 'bullish' ? 'arrowUp' : 'arrowDown',
    text: `${s.type}`,
  }));

  const priceLines = [];
  for (const ob of activeOBs.slice(0, 3)) {
    priceLines.push({
      price: ob.high,
      color: ob.bias === 'bullish' ? '#3179f588' : '#f77c8088',
      title: ob.bias === 'bullish' ? 'Bull OB' : 'Bear OB',
    });
    priceLines.push({
      price: ob.low,
      color: ob.bias === 'bullish' ? '#3179f544' : '#f77c8044',
      title: '',
    });
  }
  for (const g of fvgs.slice(-2)) {
    priceLines.push({ price: g.top, color: '#00ff6844', title: 'FVG' });
    priceLines.push({ price: g.bottom, color: '#00ff6844', title: '' });
  }
  if (zone === 'discount' || zone === 'premium') {
    priceLines.push({
      price: zone === 'discount' ? trailingBottom : trailingTop,
      color: zone === 'discount' ? '#08998166' : '#F2364566',
      title: zone === 'discount' ? 'Discount' : 'Premium',
    });
  }

  return {
    attribution: 'LuxAlgo Smart Money Concepts (CC BY-NC-SA 4.0)',
    trend: swing.trend === BULLISH ? 'bullish' : swing.trend === BEARISH ? 'bearish' : 'neutral',
    internalTrend: internal.trend === BULLISH ? 'bullish' : internal.trend === BEARISH ? 'bearish' : 'neutral',
    zone,
    smcScore: score,
    recommendation,
    signals,
    structureSignals: recentSignals.slice(-20),
    orderBlocks: activeOBs,
    fairValueGaps: fvgs,
    zones: {
      premium: 0.95 * trailingTop + 0.05 * trailingBottom,
      equilibrium: (trailingTop + trailingBottom) / 2,
      discount: 0.95 * trailingBottom + 0.05 * trailingTop,
      trailingTop,
      trailingBottom,
    },
    overlay: { markers, priceLines },
  };
}
