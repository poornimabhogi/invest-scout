const POSITIVE = [
  'surge', 'soar', 'jump', 'rally', 'beat', 'growth', 'record', 'upgrade', 'buy',
  'outperform', 'strong', 'profit', 'gain', 'bullish', 'breakout', 'momentum', 'high',
];
const NEGATIVE = [
  'fall', 'drop', 'plunge', 'miss', 'cut', 'downgrade', 'sell', 'weak', 'loss',
  'bearish', 'decline', 'lawsuit', 'investigation', 'warning', 'concern', 'crash',
];

export function computeRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

export function computeSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * MACD (Moving Average Convergence Divergence)
 * Standard params (TradingView): Fast=12, Slow=26, Signal=9  — written MACD(12, 26, 9)
 * NOT (12, 9, 26): 9 is the signal smoothing period, not the slow EMA.
 *
 * MACD line  = EMA(fast) − EMA(slow)
 * Signal     = EMA(MACD line, signalPeriod)
 * Histogram  = MACD line − Signal
 */
function emaPine(values, period) {
  const result = [];
  const k = 2 / (period + 1);
  let ema = null;

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
      for (let j = i - period + 1; j <= i; j++) sum += values[j];
      ema = sum / period;
      result.push(ema);
    } else {
      ema = k * val + (1 - k) * ema;
      result.push(ema);
    }
  }
  return result;
}

export function computeMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (closes.length < slowPeriod + signalPeriod) {
    return {
      macd: null,
      signal: null,
      histogram: null,
      trend: 'insufficient',
      series: [],
      signals: [],
    };
  }

  const fast = emaPine(closes, fastPeriod);
  const slow = emaPine(closes, slowPeriod);
  const macdLine = closes.map((_, i) =>
    fast[i] != null && slow[i] != null ? fast[i] - slow[i] : null
  );

  const signalLine = emaPine(macdLine, signalPeriod);

  const histogram = closes.map((_, i) =>
    macdLine[i] != null && signalLine[i] != null ? macdLine[i] - signalLine[i] : null
  );

  const series = closes.map((_, i) => ({
    macd: macdLine[i],
    signal: signalLine[i],
    histogram: histogram[i],
  }));

  const last = closes.length - 1;
  const prev = closes.length - 2;
  const macd = macdLine[last];
  const signal = signalLine[last];
  const hist = histogram[last];

  const signals = [];
  let trend = 'neutral';

  if (macd != null && signal != null && hist != null) {
    if (hist > 0 && macd > signal) trend = 'bullish';
    else if (hist < 0 && macd < signal) trend = 'bearish';

    if (
      prev >= 0 &&
      macdLine[prev] != null &&
      signalLine[prev] != null &&
      macdLine[prev] <= signalLine[prev] &&
      macd > signal
    ) {
      signals.push('MACD bullish crossover — momentum turning up');
    } else if (
      prev >= 0 &&
      macdLine[prev] != null &&
      signalLine[prev] != null &&
      macdLine[prev] >= signalLine[prev] &&
      macd < signal
    ) {
      signals.push('MACD bearish crossover — momentum fading');
    } else if (hist > 0 && histogram[prev] != null && hist > histogram[prev]) {
      signals.push('MACD histogram expanding — bullish momentum building');
    } else if (hist < 0 && histogram[prev] != null && hist < histogram[prev]) {
      signals.push('MACD histogram deepening — bearish pressure');
    }
  }

  return {
    macd: macd != null ? Math.round(macd * 1000) / 1000 : null,
    signal: signal != null ? Math.round(signal * 1000) / 1000 : null,
    histogram: hist != null ? Math.round(hist * 1000) / 1000 : null,
    trend,
    series,
    signals,
    params: { fast: fastPeriod, slow: slowPeriod, signal: signalPeriod },
  };
}

export function analyzeChart(candles) {
  if (!candles?.length) {
    return {
      rsi: 50,
      signals: [],
      lifetimeReturn: 0,
      pattern: 'Insufficient data',
      macd: { macd: null, signal: null, histogram: null, trend: 'insufficient', series: [], signals: [] },
    };
  }

  const closes = candles.map((c) => c.close);
  const first = closes[0];
  const last = closes[closes.length - 1];
  const lifetimeReturn = first > 0 ? Math.round(((last - first) / first) * 10000) / 100 : 0;

  const rsi = computeRSI(closes);
  const sma20 = computeSMA(closes, 20);
  const sma50 = computeSMA(closes, 50);
  const sma200 = computeSMA(closes, 200);

  const signals = [];
  if (rsi < 35) signals.push('RSI oversold — potential bounce zone');
  else if (rsi > 70) signals.push('RSI overbought — watch for pullback');
  else if (rsi >= 45 && rsi <= 60) signals.push('RSI neutral — trend continuation likely');

  if (sma50 && sma200) {
    if (last > sma50 && sma50 > sma200) signals.push('Golden trend: price above 50 & 200 MA');
    else if (last > sma50 && last < sma200) signals.push('Recovery setup: reclaiming 50-day MA');
    else if (last < sma50 && last < sma200) signals.push('Downtrend: below key moving averages');
  }

  if (sma20 && last > sma20 * 1.02) signals.push('Short-term breakout above 20-day MA');

  const recentHigh = Math.max(...closes.slice(-20));
  if (last >= recentHigh * 0.98) signals.push('Near 20-day high — momentum breakout');

  const volRecent = candles.slice(-5).map((c) => c.volume);
  const volAvg = candles.slice(-20).map((c) => c.volume);
  const avgVol = volAvg.reduce((a, b) => a + b, 0) / volAvg.length;
  const recentVol = volRecent.reduce((a, b) => a + b, 0) / volRecent.length;
  if (recentVol > avgVol * 1.5) signals.push('Volume spike — institutional interest');

  const macd = computeMACD(closes);
  signals.push(...macd.signals);

  let pattern = 'Consolidation';
  if (lifetimeReturn > 50 && last > (sma50 ?? last)) pattern = 'Long-term uptrend';
  else if (lifetimeReturn < -20) pattern = 'Long-term downtrend';
  else if (rsi < 40 && last > closes[closes.length - 5]) pattern = 'Oversold reversal setup';
  else if (macd.trend === 'bullish') pattern = 'MACD bullish — uptrend momentum';
  else if (macd.trend === 'bearish') pattern = 'MACD bearish — downtrend pressure';

  return { rsi, sma20, sma50, sma200, signals, lifetimeReturn, pattern, macd };
}

export function scoreNewsSentiment(headline) {
  const text = headline.toLowerCase();
  let score = 0;
  for (const w of POSITIVE) if (text.includes(w)) score += 1;
  for (const w of NEGATIVE) if (text.includes(w)) score -= 1;
  return score;
}

export function buildStrategyScore(stock, chartAnalysis, newsItems, smc = null) {
  let score = stock.compositeScore ?? 0;

  if (chartAnalysis.rsi < 40) score += 5;
  if (chartAnalysis.rsi > 70) score -= 3;
  for (const s of chartAnalysis.signals) {
    if (s.includes('breakout') || s.includes('Golden') || s.includes('Volume spike')) score += 4;
    if (s.includes('Downtrend') || s.includes('overbought')) score -= 3;
  }

  const newsScore = newsItems.reduce((sum, n) => sum + scoreNewsSentiment(n.headline), 0);
  score += newsScore * 2;

  if (stock.momentumTier === 'strong') score += 5;
  if (stock.celebrityScore >= 2) score += 4;
  if (chartAnalysis.macd?.trend === 'bullish') score += 3;
  if (chartAnalysis.macd?.trend === 'bearish') score -= 2;

  if (smc?.recommendation === 'buy') score += 4;
  else if (smc?.recommendation === 'avoid') score -= 3;
  if (smc?.zone === 'discount') score += 2;
  if (smc?.trend === 'bullish') score += 2;
  if (smc?.trend === 'bearish') score -= 2;

  let recommendation = 'watch';
  if (score >= 15 && stock.aiRecommendation !== 'sell') recommendation = 'buy';
  else if (score < 5 || stock.aiRecommendation === 'sell') recommendation = 'avoid';

  return { score: Math.round(score * 10) / 10, recommendation, newsScore };
}
