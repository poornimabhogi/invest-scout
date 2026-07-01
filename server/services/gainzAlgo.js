/**
 * GainzAlgo Suite — open approximation (NOT the paid invite-only script).
 * @see https://www.tradingview.com/v/h7UO9YR8/
 *
 * Modes (public descriptions only):
 * - standard: 4 sequential layers (reversal → volatility → momentum → trend)
 * - alpha:    engulfing + stable candle + RSI + pullback context (V2 Alpha concept)
 * - pro:      weighted confidence score vs adaptive threshold
 *
 * Official access: https://gainzalgo.com (paid). No legitimate free source code for the Suite.
 */

function computeAtr(candles, period = 14) {
  if (candles.length < period + 1) return candles.at(-1)?.close * 0.02 ?? 1;
  const trs = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)));
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

function atrPercentile(candles, period = 14, lookback = 60) {
  const atrs = [];
  for (let end = candles.length; end >= Math.max(period + 2, candles.length - lookback); end--) {
    const slice = candles.slice(0, end);
    if (slice.length >= period + 1) atrs.push(computeAtr(slice, period));
  }
  if (!atrs.length) return 50;
  const current = atrs[0];
  const below = atrs.filter((a) => a <= current).length;
  return Math.round((below / atrs.length) * 100);
}

function isStableCandle(c, atr, stabilityMin = 0.55) {
  const range = c.high - c.low;
  if (range <= 0) return false;
  const bodyRatio = Math.abs(c.close - c.open) / range;
  const rangeVsAtr = range / (atr || range);
  return bodyRatio >= stabilityMin && rangeVsAtr >= 0.35 && rangeVsAtr <= 2.5;
}

function reversalLayer(candles, msb) {
  const n = candles.length;
  if (n < 3) return { pass: false, reason: 'Need more candles' };

  const c = candles[n - 1];
  const p = candles[n - 2];
  const bullishEngulfing = p.close < p.open && c.close > c.open && c.close > p.open && c.open <= p.close;
  const bearishEngulfing = p.close > p.open && c.close < c.open && c.close < p.open && c.open >= p.close;

  const hammer =
    c.close > c.open &&
    c.open - c.low > 2 * Math.abs(c.close - c.open) &&
    c.high - c.close < Math.abs(c.close - c.open);

  const msbBull = msb?.recommendation === 'buy' || msb?.market === 'bullish';

  if (bullishEngulfing) return { pass: true, bias: 'buy', reason: 'Bullish engulfing reversal' };
  if (hammer) return { pass: true, bias: 'buy', reason: 'Hammer / pin reversal' };
  if (msbBull) return { pass: true, bias: 'buy', reason: 'MSB bullish structure shift' };
  if (bearishEngulfing) return { pass: true, bias: 'sell', reason: 'Bearish engulfing' };

  return { pass: false, reason: 'No reversal structure on last bar' };
}

function volatilityLayer(candles, chartAnalysis) {
  const atr = computeAtr(candles);
  const pct = atrPercentile(candles);
  const last = candles.at(-1);
  const range = last.high - last.low;
  const squeeze = chartAnalysis.squeeze ?? {};

  if (squeeze.squeezeOn && !squeeze.squeezeOff) {
    return { pass: false, reason: 'Volatility compressed (squeeze on) — wait for expansion', atrPct: pct };
  }

  if (pct > 92) {
    return { pass: false, reason: 'Volatility extremely elevated (>92nd pct)', atrPct: pct };
  }

  if (range < atr * 0.25) {
    return { pass: false, reason: 'Bar range too tight vs ATR', atrPct: pct };
  }

  return { pass: true, reason: `Volatility context OK (${pct}th ATR percentile)`, atrPct: pct, atr };
}

function momentumLayer(chartAnalysis) {
  const macd = chartAnalysis.macd?.trend;
  const rsi = chartAnalysis.rsi ?? 50;
  const squeeze = chartAnalysis.squeeze ?? {};

  const macdOk = macd === 'bullish';
  const rsiOk = rsi > 40 && rsi < 72;
  const squeezeBull = squeeze.squeezeOff && squeeze.momentum === 'bullish';

  if (macdOk || squeezeBull) {
    return { pass: true, reason: macdOk ? 'MACD momentum bullish' : 'Squeeze fired bullish' };
  }
  if (rsiOk && rsi < 55) {
    return { pass: true, reason: 'RSI recovering from neutral/low zone' };
  }
  return { pass: false, reason: 'Momentum not confirmed' };
}

function trendLayer(candles, chartAnalysis) {
  const close = candles.at(-1).close;
  const sma20 = chartAnalysis.sma20;
  const sma50 = chartAnalysis.sma50;

  if (sma20 && sma50 && close > sma20 && sma20 > sma50) {
    return { pass: true, reason: 'Golden trend — above SMA20/50' };
  }
  if (sma20 && close > sma20) {
    return { pass: true, reason: 'Price above SMA20' };
  }
  return { pass: false, reason: 'Short-term trend not bullish' };
}

function analyzeStandard(candles, ctx) {
  const layers = {
    reversal: reversalLayer(candles, ctx.msb),
    volatility: volatilityLayer(candles, ctx.chartAnalysis),
    momentum: momentumLayer(ctx.chartAnalysis),
    trend: trendLayer(candles, ctx.chartAnalysis),
  };

  const buyOk =
    layers.reversal.pass &&
    layers.reversal.bias === 'buy' &&
    layers.volatility.pass &&
    layers.momentum.pass &&
    layers.trend.pass;

  const sellOk = layers.reversal.pass && layers.reversal.bias === 'sell' && layers.volatility.pass;

  return {
    mode: 'standard',
    signal: buyOk ? 'buy' : sellOk ? 'sell' : 'none',
    layers,
    allLayersPass: buyOk,
    confidence: buyOk ? 78 : sellOk ? 72 : 0,
  };
}

function analyzeAlpha(candles, ctx, { rsiCap = 80, deltaLen = 14, stability = 0.55 } = {}) {
  const n = candles.length;
  if (n < deltaLen + 2) {
    return { mode: 'alpha', signal: 'none', confidence: 0, checks: ['Insufficient history'] };
  }

  const c = candles[n - 1];
  const p = candles[n - 2];
  const atr = computeAtr(candles);
  const rsi = ctx.chartAnalysis.rsi ?? 50;

  const bullishEngulfing = p.close < p.open && c.close > c.open && c.close > p.open;
  const bearishEngulfing = p.close > p.open && c.close < c.open && c.close < p.open;
  const stable = isStableCandle(c, atr, stability);
  const pullback = c.close < candles[n - 1 - deltaLen].close;
  const rally = c.close > candles[n - 1 - deltaLen].close;

  let signal = 'none';
  let confidence = 0;
  const checks = [];

  if (bullishEngulfing && stable && rsi < rsiCap && pullback) {
    signal = 'buy';
    confidence = 75 + (rsi < 50 ? 5 : 0);
    checks.push('Alpha buy: engulfing + stable + RSI + 14-bar pullback');
  } else if (bearishEngulfing && stable && rsi > 100 - rsiCap && rally) {
    signal = 'sell';
    confidence = 72;
    checks.push('Alpha sell: bearish engulfing + extension');
  } else {
    if (!bullishEngulfing && !bearishEngulfing) checks.push('No engulfing pattern');
    if (!stable) checks.push('Candle stability filter failed');
    if (bullishEngulfing && !pullback) checks.push('No pullback context (14 bars)');
  }

  const tpSl =
    signal === 'buy'
      ? calcTpSl(c.close, atr, 'buy')
      : signal === 'sell'
        ? calcTpSl(c.close, atr, 'sell')
        : null;

  return { mode: 'alpha', signal, confidence, checks, tpSl, stable, rsi };
}

function analyzePro(candles, ctx) {
  const standard = analyzeStandard(candles, ctx);
  const atrPct = standard.layers?.volatility?.atrPct ?? 50;
  const rsi = ctx.chartAnalysis.rsi ?? 50;
  const tier = ctx.stock?.momentumTier ?? 'neutral';

  let score = 0;
  if (standard.layers.reversal.pass) score += 25;
  if (standard.layers.volatility.pass) score += 20;
  if (standard.layers.momentum.pass) score += 25;
  if (standard.layers.trend.pass) score += 20;
  if (ctx.msb?.recommendation === 'buy') score += 5;
  if (ctx.smc?.recommendation === 'buy') score += 5;
  if (tier === 'strong') score += 8;
  else if (tier === 'building') score += 4;
  if (rsi > 70) score -= 10;

  const threshold = atrPct > 70 ? 72 : atrPct < 30 ? 58 : 65;
  const signal = score >= threshold ? 'buy' : score <= 35 ? 'sell' : 'none';

  return { mode: 'pro', signal, confidence: score, threshold, score, adaptiveThreshold: threshold };
}

function calcTpSl(price, atr, side, mult = 1.2, rr = 2) {
  const dist = atr * mult;
  if (side === 'buy') {
    return {
      takeProfit: Math.round((price + dist * rr) * 100) / 100,
      stopLoss: Math.round((price - dist) * 100) / 100,
    };
  }
  return {
    takeProfit: Math.round((price - dist * rr) * 100) / 100,
    stopLoss: Math.round((price + dist) * 100) / 100,
  };
}

export function analyzeGainzAlgo(candles, stock, ctx, mode = 'standard') {
  if (!candles?.length) {
    return {
      attribution: 'GainzAlgo-inspired (open)',
      reference: 'https://www.tradingview.com/v/h7UO9YR8/',
      mode,
      signal: 'none',
      recommendation: 'watch',
      disclaimer: 'Not the paid GainzAlgo Suite — open reimplementation of public concepts only.',
    };
  }

  const fullCtx = { ...ctx, stock };
  let result;

  if (mode === 'alpha') result = analyzeAlpha(candles, fullCtx);
  else if (mode === 'pro') result = analyzePro(candles, fullCtx);
  else result = analyzeStandard(candles, fullCtx);

  const atr = computeAtr(candles);
  const tpSl =
    result.tpSl ??
    (result.signal === 'buy'
      ? calcTpSl(candles.at(-1).close, atr, 'buy')
      : result.signal === 'sell'
        ? calcTpSl(candles.at(-1).close, atr, 'sell')
        : null);

  let recommendation = 'watch';
  if (result.signal === 'buy') recommendation = 'buy';
  if (result.signal === 'sell') recommendation = 'avoid';

  return {
    attribution: 'GainzAlgo-inspired (open)',
    reference: 'https://www.tradingview.com/v/h7UO9YR8/',
    officialUrl: 'https://gainzalgo.com',
    mode: result.mode ?? mode,
    signal: result.signal ?? 'none',
    confidence: result.confidence ?? 0,
    recommendation,
    layers: result.layers ?? null,
    checks: result.checks ?? [],
    score: result.score ?? null,
    adaptiveThreshold: result.adaptiveThreshold ?? null,
    tpSl,
    signals: [
      ...(result.checks ?? []),
      ...(result.layers
        ? Object.entries(result.layers).map(([k, v]) => `${k}: ${v.pass ? '✓' : '✗'} ${v.reason}`)
        : []),
    ].slice(0, 6),
    disclaimer:
      'Open approximation only. The real GainzAlgo Suite is invite-only on TradingView. Do not use leaked/pirated scripts.',
  };
}

export function gainzQualifies(gainz, { mode = 'standard', minConfidence = 65 } = {}) {
  if (!gainz || gainz.signal !== 'buy') return false;
  if (mode === 'standard') {
    return (
      gainz.layers?.reversal?.pass &&
      gainz.layers?.volatility?.pass &&
      gainz.layers?.momentum?.pass &&
      gainz.layers?.trend?.pass
    );
  }
  return (gainz.confidence ?? 0) >= minConfidence;
}
