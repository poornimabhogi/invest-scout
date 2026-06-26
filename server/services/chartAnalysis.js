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

export function analyzeChart(candles) {
  if (!candles?.length) {
    return { rsi: 50, signals: [], lifetimeReturn: 0, pattern: 'Insufficient data' };
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

  let pattern = 'Consolidation';
  if (lifetimeReturn > 50 && last > (sma50 ?? last)) pattern = 'Long-term uptrend';
  else if (lifetimeReturn < -20) pattern = 'Long-term downtrend';
  else if (rsi < 40 && last > closes[closes.length - 5]) pattern = 'Oversold reversal setup';

  return { rsi, sma20, sma50, sma200, signals, lifetimeReturn, pattern };
}

export function scoreNewsSentiment(headline) {
  const text = headline.toLowerCase();
  let score = 0;
  for (const w of POSITIVE) if (text.includes(w)) score += 1;
  for (const w of NEGATIVE) if (text.includes(w)) score -= 1;
  return score;
}

export function buildStrategyScore(stock, chartAnalysis, newsItems) {
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

  let recommendation = 'watch';
  if (score >= 15 && stock.aiRecommendation !== 'sell') recommendation = 'buy';
  else if (score < 5 || stock.aiRecommendation === 'sell') recommendation = 'avoid';

  return { score: Math.round(score * 10) / 10, recommendation, newsScore };
}
