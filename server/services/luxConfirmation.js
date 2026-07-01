/**
 * LuxAlgo Signals & Overlays™ — open approximation (not proprietary Pine).
 * Maps their recommended workflow: Confirmation signals + Smart Trail filter + Trend Strength filter.
 * @see https://www.tradingview.com/v/fYHlrAoz/
 *
 * Smart Trail  → UT Bot ATR trailing stop
 * Trend Strength → momentum tier + squeeze state
 * Structure overlays → SMC + MSB (already in stack)
 * Reversal zones / OTE → optimalTradeEntry
 */

function consecutiveCandleTrend(candles, maxLookback = 6) {
  let greenStreak = 0;
  let redStreak = 0;

  for (let i = candles.length - 1; i >= Math.max(0, candles.length - maxLookback); i--) {
    const c = candles[i];
    const green = c.close >= c.open;
    if (green) {
      if (redStreak > 0) break;
      greenStreak++;
    } else {
      if (greenStreak > 0) break;
      redStreak++;
    }
  }

  let trend = 'neutral';
  if (greenStreak >= 3) trend = 'bullish';
  else if (redStreak >= 3) trend = 'bearish';

  return { greenStreak, redStreak, trend };
}

function trendStrengthFilter(chartAnalysis, stock) {
  const tier = stock?.momentumTier ?? 'neutral';
  const squeeze = chartAnalysis.squeeze ?? {};

  if (tier === 'weak') {
    return { pass: false, state: 'ranging', reason: 'Weak momentum — Lux trend strength filter blocks' };
  }

  if (squeeze.squeezeOn && squeeze.momentum === 'insufficient') {
    return { pass: false, state: 'ranging', reason: 'Squeeze on without direction — likely ranging' };
  }

  const trending = tier === 'strong' || tier === 'building' || squeeze.squeezeOff;
  return {
    pass: trending,
    state: trending ? 'trending' : 'ranging',
    reason: trending ? 'Trend strength OK' : 'Neutral chop — wait for trend',
  };
}

function smartTrailFilter(candles, utBot) {
  const lastClose = candles.at(-1)?.close ?? 0;
  const trail = utBot?.trailingStop ?? 0;
  const long = utBot?.position === 'long' || lastClose > trail;
  return {
    pass: long && lastClose > trail,
    trailingStop: trail,
    position: utBot?.position ?? 'neutral',
    reason: long
      ? 'Smart Trail (UT Bot) — price above dynamic support'
      : 'Below Smart Trail — confirmation filtered out',
  };
}

function classifySignalLevel(signal, ctx) {
  const { smc, msb, utBot, ote, chartAnalysis } = ctx;
  const dual = (smc?.recommendation === 'buy' || smc?.trend === 'bullish') &&
    (msb?.recommendation === 'buy' || msb?.market === 'bullish');
  const squeezeBull =
    chartAnalysis.squeeze?.squeezeOff && chartAnalysis.squeeze?.momentum === 'bullish';

  if (signal === 'strong_buy' && dual && squeezeBull) return 4;
  if (signal === 'strong_buy' || (signal === 'buy' && dual)) return 3;
  if (signal === 'buy') return 3;
  if (signal === 'sell' || signal === 'strong_sell') return 1;
  if (ote?.inOteZone && ote?.bias === 'bullish') return 2;
  return 1;
}

/**
 * LuxAlgo-style confirmation signal (trend-following mode, not contrarian).
 */
export function analyzeLuxConfirmation(candles, stock, ctx) {
  const { chartAnalysis, utBot, smc, msb, ote } = ctx;

  if (!candles?.length || candles.length < 30) {
    return {
      attribution: 'LuxAlgo-inspired confirmation layer',
      signal: 'none',
      isStrong: false,
      classification: 1,
      candleTrend: 'neutral',
      filters: { smartTrail: { pass: false }, trendStrength: { pass: false } },
      recommendation: 'watch',
      signals: ['Insufficient history'],
      exitSignal: false,
    };
  }

  const candle = consecutiveCandleTrend(candles);
  const smartTrail = smartTrailFilter(candles, utBot);
  const trendStrength = trendStrengthFilter(chartAnalysis, stock);

  const macdBull = chartAnalysis.macd?.trend === 'bullish';
  const aboveSma20 =
    chartAnalysis.sma20 != null && candles.at(-1).close > chartAnalysis.sma20;
  const rsi = chartAnalysis.rsi ?? 50;
  const notOverbought = rsi < 72;

  const baseConfirmation =
    (macdBull || aboveSma20) && candle.trend !== 'bearish' && notOverbought;

  const structureOk =
    utBot?.recommendation === 'buy' ||
    smc?.recommendation === 'buy' ||
    msb?.recommendation === 'buy';

  const filtersPass = smartTrail.pass && trendStrength.pass;

  let signal = 'none';
  const signals = [];

  if (baseConfirmation && filtersPass) {
    const strong =
      candle.greenStreak >= 3 &&
      structureOk &&
      (utBot?.signal === 'buy' || macdBull);
    signal = strong ? 'strong_buy' : 'buy';
    signals.push(
      strong
        ? 'Strong confirmation (+) — trend + Smart Trail + green candle hold'
        : 'Confirmation buy — trend aligned with Smart Trail filter'
    );
  } else if (baseConfirmation && !filtersPass) {
    signals.push('Raw confirmation present but filtered (Smart Trail or trend strength)');
  }

  if (candle.trend === 'bearish' && !smartTrail.pass) {
    signal = utBot?.signal === 'sell' ? 'sell' : signal;
    if (utBot?.signal === 'sell') signals.push('Confirmation sell — lost Smart Trail support');
  }

  const classification = classifySignalLevel(signal, ctx);
  const exitSignal =
    utBot?.signal === 'sell' ||
    utBot?.position === 'short' ||
    (rsi > 75 && candle.trend === 'bearish');

  let recommendation = 'watch';
  if (signal === 'strong_buy' || signal === 'buy') recommendation = 'buy';
  else if (signal === 'sell' || signal === 'strong_sell') recommendation = 'avoid';

  return {
    attribution: 'LuxAlgo-inspired (Confirmation + Smart Trail + Trend Strength)',
    reference: 'https://www.tradingview.com/v/fYHlrAoz/',
    signal,
    isStrong: signal === 'strong_buy' || signal === 'strong_sell',
    classification,
    classificationLabel:
      classification >= 3 ? 'Trend continuation' : classification === 2 ? 'Retracement' : 'Reversal / weak',
    candleTrend: candle.trend,
    candleColor: candle.trend === 'bullish' ? 'green' : candle.trend === 'bearish' ? 'red' : 'purple',
    filters: {
      smartTrail,
      trendStrength,
    },
    recommendation,
    exitSignal,
    signals,
    presetHint: 'Swing: Confirmation + Smart Trail filter + Trend Strength filter',
  };
}

export function luxConfirmationQualifies(lux, { strongOnly = false } = {}) {
  if (!lux) return false;
  if (strongOnly) return lux.signal === 'strong_buy' && lux.classification >= 3;
  return (lux.signal === 'buy' || lux.signal === 'strong_buy') && lux.classification >= 2;
}
