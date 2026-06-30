/**
 * Automatic OTE — Optimal Trade Entry (62–79% Fib retracement)
 * SMC / FX4LIVING-inspired: entry zone after impulse leg in trend direction.
 */

const OTE_FIB_LOW = 0.62;
const OTE_FIB_HIGH = 0.79;

function findImpulseLeg(candles, lookback = 60) {
  const start = Math.max(0, candles.length - lookback);
  let swingLow = { price: Infinity, idx: start, time: candles[start].time };
  let swingHigh = { price: -Infinity, idx: start, time: candles[start].time };

  for (let i = start; i < candles.length; i++) {
    const c = candles[i];
    if (c.low < swingLow.price) swingLow = { price: c.low, idx: i, time: c.time };
    if (c.high > swingHigh.price) swingHigh = { price: c.high, idx: i, time: c.time };
  }

  if (swingLow.price >= swingHigh.price) return null;

  if (swingLow.idx < swingHigh.idx) {
    return { bias: 'bullish', swingLow, swingHigh };
  }
  return { bias: 'bearish', swingLow, swingHigh };
}

function computeOteZone(leg) {
  const { swingLow, swingHigh, bias } = leg;
  const range = swingHigh.price - swingLow.price;
  if (range <= 0) return null;

  if (bias === 'bullish') {
    const oteTop = swingHigh.price - range * OTE_FIB_LOW;
    const oteBottom = swingHigh.price - range * OTE_FIB_HIGH;
    return {
      bias,
      oteTop: Math.round(oteTop * 100) / 100,
      oteBottom: Math.round(oteBottom * 100) / 100,
      swingHigh: swingHigh.price,
      swingLow: swingLow.price,
      equilibrium: Math.round((swingLow.price + range * 0.5) * 100) / 100,
      swingHighTime: swingHigh.time,
      swingLowTime: swingLow.time,
    };
  }

  const oteBottom = swingLow.price + range * OTE_FIB_LOW;
  const oteTop = swingLow.price + range * OTE_FIB_HIGH;
  return {
    bias,
    oteTop: Math.round(oteTop * 100) / 100,
    oteBottom: Math.round(oteBottom * 100) / 100,
    swingHigh: swingHigh.price,
    swingLow: swingLow.price,
    equilibrium: Math.round((swingLow.price + range * 0.5) * 100) / 100,
    swingHighTime: swingHigh.time,
    swingLowTime: swingLow.time,
  };
}

function priceInZone(close, zone) {
  const top = Math.max(zone.oteTop, zone.oteBottom);
  const bottom = Math.min(zone.oteTop, zone.oteBottom);
  return close >= bottom && close <= top;
}

function nearZone(close, zone, tolerancePct = 0.015) {
  const top = Math.max(zone.oteTop, zone.oteBottom);
  const bottom = Math.min(zone.oteTop, zone.oteBottom);
  const pad = close * tolerancePct;
  return close >= bottom - pad && close <= top + pad;
}

export function analyzeOptimalTradeEntry(candles, lookback = 60) {
  if (!candles?.length || candles.length < 25) {
    return {
      attribution: 'Automatic OTE — Fib 62–79% (SMC / FX4LIVING-inspired)',
      bias: 'neutral',
      inOteZone: false,
      nearOteZone: false,
      oteScore: 0,
      recommendation: 'watch',
      signals: ['Insufficient history for OTE'],
      zone: null,
      overlay: { markers: [], priceLines: [] },
    };
  }

  const leg = findImpulseLeg(candles, lookback);
  const last = candles.at(-1);
  const close = last.close;

  if (!leg) {
    return {
      attribution: 'Automatic OTE — Fib 62–79% (SMC / FX4LIVING-inspired)',
      bias: 'neutral',
      inOteZone: false,
      nearOteZone: false,
      oteScore: 0,
      recommendation: 'watch',
      signals: ['No clear impulse leg for OTE'],
      zone: null,
      overlay: { markers: [], priceLines: [] },
    };
  }

  const zone = computeOteZone(leg);
  const inOteZone = priceInZone(close, zone);
  const nearOteZone = !inOteZone && nearZone(close, zone);

  const signals = [];
  let oteScore = 0;

  if (zone.bias === 'bullish') {
    if (inOteZone) {
      oteScore += 5;
      signals.push('Price in bullish OTE zone (62–79% Fib retracement)');
    } else if (nearOteZone) {
      oteScore += 2;
      signals.push('Price approaching bullish OTE zone');
    } else if (close > zone.oteTop && close <= zone.swingHigh) {
      oteScore += 1;
      signals.push('Above OTE — shallow retrace, watch for pullback');
    } else if (close < zone.oteBottom) {
      oteScore -= 2;
      signals.push('Below OTE — deep retrace or leg invalidation');
    } else {
      signals.push('Bullish leg — price extended above swing high area');
    }
  } else if (inOteZone) {
    oteScore -= 3;
    signals.push('Price in bearish OTE (premium) — caution for longs');
  } else if (close > zone.swingHigh) {
    oteScore -= 1;
    signals.push('Bearish structure — price above prior swing high');
  }

  let recommendation = 'watch';
  if (oteScore >= 4 && zone.bias === 'bullish') recommendation = 'buy';
  else if (oteScore <= -2) recommendation = 'avoid';

  const priceLines = [
    { price: zone.oteTop, color: '#8b5cf688', title: 'OTE 62%' },
    { price: zone.oteBottom, color: '#8b5cf644', title: 'OTE 79%' },
    { price: zone.equilibrium, color: '#94a3b855', title: 'EQ 50%' },
  ];

  const markers = [];
  if (inOteZone && zone.bias === 'bullish') {
    markers.push({
      time: last.time,
      position: 'belowBar',
      color: '#8b5cf6',
      shape: 'circle',
      text: 'OTE',
    });
  }

  return {
    attribution: 'Automatic OTE — Fib 62–79% (SMC / FX4LIVING-inspired)',
    bias: zone.bias,
    inOteZone,
    nearOteZone,
    oteScore: Math.round(oteScore * 10) / 10,
    recommendation,
    signals,
    zone: {
      ...zone,
      fibLow: OTE_FIB_LOW,
      fibHigh: OTE_FIB_HIGH,
      currentPrice: close,
    },
    overlay: { markers, priceLines },
  };
}
