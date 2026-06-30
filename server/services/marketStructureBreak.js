/**
 * Market Structure Break & Order Block — inspired by EmreKb MSB-OB (Mozilla Public License 2.0)
 * © EmreKb — https://mozilla.org/MPL/2.0/
 */

function highest(candles, endIdx, len) {
  let max = -Infinity;
  for (let i = Math.max(0, endIdx - len + 1); i <= endIdx; i++) {
    max = Math.max(max, candles[i].high);
  }
  return max;
}

function lowest(candles, endIdx, len) {
  let min = Infinity;
  for (let i = Math.max(0, endIdx - len + 1); i <= endIdx; i++) {
    min = Math.min(min, candles[i].low);
  }
  return min;
}

function barsSince(candles, endIdx, predicate) {
  for (let i = endIdx; i >= 0; i--) {
    if (predicate(i)) return endIdx - i;
  }
  return endIdx;
}

function findObIndex(candles, fromIdx, toIdx, bearish) {
  const start = Math.min(fromIdx, toIdx);
  const end = Math.max(fromIdx, toIdx);
  let found = end;
  for (let i = start; i <= end; i++) {
    const c = candles[i];
    if (bearish ? c.open > c.close : c.open < c.close) found = i;
  }
  return found;
}

export function analyzeMarketStructureBreak(candles, zigzagLen = 9, fibFactor = 0.33) {
  if (!candles?.length || candles.length < zigzagLen * 4) {
    return {
      attribution: 'EmreKb MSB-OB (MPL 2.0)',
      market: 'neutral',
      msbScore: 0,
      recommendation: 'watch',
      signals: ['Insufficient history for MSB-OB'],
      lastMsb: null,
      activeZones: [],
      overlay: { markers: [], priceLines: [] },
    };
  }

  let trend = 1;
  let market = 1;
  let lastL0AtMsb = null;
  let lastH0AtMsb = null;

  const highPivots = [];
  const lowPivots = [];
  const msbEvents = [];
  const zones = [];

  for (let i = zigzagLen; i < candles.length; i++) {
    const toUp = candles[i].high >= highest(candles, i, zigzagLen);
    const toDown = candles[i].low <= lowest(candles, i, zigzagLen);
    const prevTrend = trend;

    if (trend === 1 && toDown) trend = -1;
    else if (trend === -1 && toUp) trend = 1;

    if (trend !== prevTrend) {
      const upSince = barsSince(candles, i - 1, (idx) => candles[idx].high >= highest(candles, idx, zigzagLen));
      const downSince = barsSince(candles, i - 1, (idx) => candles[idx].low <= lowest(candles, idx, zigzagLen));

      if (trend === 1) {
        let lowVal = Infinity;
        let lowIdx = i;
        for (let j = i - Math.max(upSince, 1); j <= i; j++) {
          if (candles[j].low <= lowVal) {
            lowVal = candles[j].low;
            lowIdx = j;
          }
        }
        lowPivots.push({ price: lowVal, index: lowIdx, time: candles[lowIdx].time });
      } else {
        let highVal = -Infinity;
        let highIdx = i;
        for (let j = i - Math.max(downSince, 1); j <= i; j++) {
          if (candles[j].high >= highVal) {
            highVal = candles[j].high;
            highIdx = j;
          }
        }
        highPivots.push({ price: highVal, index: highIdx, time: candles[highIdx].time });
      }
    }

    if (highPivots.length < 2 || lowPivots.length < 2) continue;

    const h0 = highPivots.at(-1);
    const h1 = highPivots.at(-2);
    const l0 = lowPivots.at(-1);
    const l1 = lowPivots.at(-2);

    const prevMarket = market;
    const samePivot = lastL0AtMsb === l0.price || lastH0AtMsb === h0.price;

    if (!samePivot) {
      if (market === 1 && l0.price < l1.price && l0.price < l1.price - Math.abs(h0.price - l1.price) * fibFactor) {
        market = -1;
      } else if (
        market === -1 &&
        h0.price > h1.price &&
        h0.price > h1.price + Math.abs(h1.price - l0.price) * fibFactor
      ) {
        market = 1;
      }
    }

    if (market !== prevMarket) {
      lastL0AtMsb = l0.price;
      lastH0AtMsb = h0.price;

      if (market === 1) {
        const buObIdx = findObIndex(candles, h1.index, l0.index, true);
        const buBbIdx = findObIndex(candles, Math.max(0, l1.index - zigzagLen), h1.index, false);
        const ob = candles[buObIdx];
        const bb = candles[buBbIdx];
        const tag = l0.price < l1.price ? 'Bu-BB' : 'Bu-MB';

        msbEvents.push({ type: 'bullish', label: 'MSB', price: h1.price, time: candles[i].time, barIndex: i });
        zones.push(
          { type: 'Bu-OB', high: ob.high, low: ob.low, time: ob.time, bias: 'bullish' },
          { type: tag, high: bb.high, low: bb.low, time: bb.time, bias: 'bullish' }
        );
      } else {
        const beObIdx = findObIndex(candles, l1.index, h0.index, false);
        const beBbIdx = findObIndex(candles, Math.max(0, h1.index - zigzagLen), l1.index, true);
        const ob = candles[beObIdx];
        const bb = candles[beBbIdx];
        const tag = h0.price > h1.price ? 'Be-BB' : 'Be-MB';

        msbEvents.push({ type: 'bearish', label: 'MSB', price: l1.price, time: candles[i].time, barIndex: i });
        zones.push(
          { type: 'Be-OB', high: ob.high, low: ob.low, time: ob.time, bias: 'bearish' },
          { type: tag, high: bb.high, low: bb.low, time: bb.time, bias: 'bearish' }
        );
      }
    }
  }

  const last = candles.at(-1);
  const activeZones = zones
    .slice(-8)
    .filter((z) => (z.bias === 'bullish' ? last.close >= z.low : last.close <= z.high))
    .slice(-4);

  const lastMsb = msbEvents.at(-1) ?? null;
  const signals = [];
  let msbScore = 0;

  if (market === 1) {
    msbScore += 3;
    signals.push('Market structure bullish (MSB up)');
  } else if (market === -1) {
    msbScore -= 3;
    signals.push('Market structure bearish (MSB down)');
  }

  const bullOb = activeZones.find((z) => z.type === 'Bu-OB' && last.close >= z.low && last.close <= z.high);
  if (bullOb) {
    msbScore += 3;
    signals.push('Price reacting at bullish order block (Bu-OB)');
  }

  const bullBb = activeZones.find((z) => (z.type === 'Bu-BB' || z.type === 'Bu-MB') && last.close >= z.low);
  if (bullBb) {
    msbScore += 2;
    signals.push(`Price near ${bullBb.type} support zone`);
  }

  const bearOb = activeZones.find((z) => z.type === 'Be-OB' && last.close <= z.high && last.close >= z.low);
  if (bearOb) {
    msbScore -= 2;
    signals.push('Price at bearish order block (Be-OB) — caution');
  }

  if (lastMsb?.type === 'bullish' && candles.length - 1 - lastMsb.barIndex <= 15) {
    msbScore += 2;
    signals.push('Recent bullish market structure break');
  }

  let recommendation = 'watch';
  if (msbScore >= 6) recommendation = 'buy';
  else if (msbScore <= -2) recommendation = 'avoid';

  const markers = msbEvents.slice(-6).map((e) => ({
    time: e.time,
    position: e.type === 'bullish' ? 'belowBar' : 'aboveBar',
    color: e.type === 'bullish' ? '#16a34a' : '#dc2626',
    shape: e.type === 'bullish' ? 'arrowUp' : 'arrowDown',
    text: 'MSB',
  }));

  const priceLines = activeZones.flatMap((z) => [
    { price: z.high, color: z.bias === 'bullish' ? '#16a34a55' : '#dc262655', title: z.type },
    { price: z.low, color: z.bias === 'bullish' ? '#16a34a33' : '#dc262633', title: '' },
  ]);

  return {
    attribution: 'EmreKb MSB-OB (MPL 2.0)',
    market: market === 1 ? 'bullish' : market === -1 ? 'bearish' : 'neutral',
    msbScore: Math.round(msbScore * 10) / 10,
    recommendation,
    signals,
    lastMsb,
    structureBreaks: msbEvents.slice(-10),
    activeZones,
    overlay: { markers, priceLines },
  };
}
