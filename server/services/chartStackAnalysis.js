import { getCandles } from './candles.js';
import { analyzeChart, buildStrategyScore } from './chartAnalysis.js';
import { analyzeSmartMoneyConcepts } from './smartMoneyConcepts.js';
import { analyzeMarketStructureBreak } from './marketStructureBreak.js';
import { analyzeUtBot, buildStructureConfluence } from './utBot.js';
import { analyzeOptimalTradeEntry } from './optimalTradeEntry.js';
import { buildIndicatorAudit } from './chartIndicatorAudit.js';

/** Full chart stack (RSI, MACD, Squeeze, SMC, MSB, UT Bot, OTE) — no news fetch */
export function analyzeChartStack(candles, stock = {}) {
  const chartAnalysis = analyzeChart(candles);
  const smc = analyzeSmartMoneyConcepts(candles);
  const msb = analyzeMarketStructureBreak(candles);
  const utBot = analyzeUtBot(candles);
  const ote = analyzeOptimalTradeEntry(candles);

  const { score, recommendation } = buildStrategyScore(
    stock,
    chartAnalysis,
    [],
    smc,
    msb,
    utBot,
    ote
  );

  const indicatorAudit = buildIndicatorAudit(
    chartAnalysis,
    smc,
    msb,
    utBot,
    ote,
    recommendation
  );

  const confluence = buildStructureConfluence({
    smcRecommendation: smc.recommendation,
    smcTrend: smc.trend,
    smcZone: smc.zone,
    msbRecommendation: msb.recommendation,
    msbMarket: msb.market,
    utBotRecommendation: utBot.recommendation,
    utBotPosition: utBot.position,
    utBotSignal: utBot.signal,
    oteRecommendation: ote.recommendation,
    oteInZone: ote.inOteZone,
    oteBias: ote.bias,
    chartSignals: chartAnalysis.signals,
  });

  return {
    symbol: stock.symbol,
    recommendation,
    strategyScore: score,
    rsi: chartAnalysis.rsi,
    macdTrend: chartAnalysis.macd?.trend ?? 'insufficient',
    squeezeMomentum: chartAnalysis.squeeze?.momentum ?? 'insufficient',
    squeezeOn: chartAnalysis.squeeze?.squeezeOn ?? false,
    smcRecommendation: smc.recommendation,
    msbRecommendation: msb.recommendation,
    utBotRecommendation: utBot.recommendation,
    oteRecommendation: ote.recommendation,
    oteInZone: ote.inOteZone,
    indicatorAudit,
    confluence,
    signals: [
      ...chartAnalysis.signals.slice(0, 2),
      ...smc.signals.slice(0, 1),
      ...msb.signals.slice(0, 1),
      ...utBot.signals.slice(0, 1),
      ...ote.signals.slice(0, 1),
    ],
  };
}

export async function analyzeTopPicksIndicators(picks, limit = 15) {
  const results = [];
  for (const pick of (picks ?? []).slice(0, limit)) {
    try {
      const { candles } = await getCandles(pick.symbol, '1Y');
      results.push(analyzeChartStack(candles, pick));
    } catch {
      /* skip symbol */
    }
  }
  return results;
}

export async function analyzeSymbolIndicators(symbol, stock = {}) {
  const { candles } = await getCandles(symbol, '1Y');
  return analyzeChartStack(candles, { ...stock, symbol });
}
