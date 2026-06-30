import { getPreferences } from '../store.js';
import { getLearningWeights } from './learningWeights.js';
import { getAutoTradeSettings } from './paperAutoTradeSettings.js';
import { simulateCompounding } from './forecast.js';

export const DEFAULT_TRADING_PREFS = {
  maxPositionSize: 1000,
  riskLevel: 'moderate',
  maxDailyTrades: 5,
  stopLossPercentage: 8,
  takeProfitPercentage: 15,
};

const RISK_POSITION_PCT = {
  conservative: 5,
  moderate: 8,
  aggressive: 12,
};

export function getTradingPreferences() {
  const stored = getPreferences();
  return { ...DEFAULT_TRADING_PREFS, ...(stored ?? {}) };
}

/**
 * Unified risk + compound context for paper auto-trade and self-analyze gates.
 */
export function getRiskContext({ paperStats = null, backtest = null, compoundPreview = null } = {}) {
  const prefs = getTradingPreferences();
  const weights = getLearningWeights();
  const autoSettings = getAutoTradeSettings();

  const riskLevel = prefs.riskLevel ?? 'moderate';
  const riskBasedPct = RISK_POSITION_PCT[riskLevel] ?? 8;

  let positionSizePct = Math.min(
    autoSettings.positionSizePct ?? riskBasedPct,
    riskBasedPct
  );

  if (paperStats?.closedTrades >= 5) {
    if (paperStats.winRate < 40) positionSizePct = Math.max(3, positionSizePct - 3);
    else if (paperStats.winRate > 60) positionSizePct = Math.min(riskBasedPct + 2, positionSizePct + 1);
  }

  let minStrategyScore = Math.max(
    autoSettings.minStrategyScore ?? 12,
    Math.round(weights.highConfidenceThreshold / 6)
  );

  if (weights.highConfidenceThreshold >= 75) minStrategyScore += 1;

  const winRate = backtest?.winRate ?? paperStats?.winRate ?? 55;
  const avgWin = backtest?.avgWinPct ?? paperStats?.avgWinPct ?? 1.5;
  const avgLoss = backtest?.avgLossPct ?? paperStats?.avgLossPct ?? -1.2;

  const compoundHint =
    compoundPreview ??
    simulateCompounding({
      startingCapital: 10000,
      winRatePct: winRate,
      avgWinPct: avgWin,
      avgLossPct: avgLoss,
      tradesPerDay: Math.min(prefs.maxDailyTrades ?? 5, autoSettings.maxPositions ?? 8),
      days: 30,
      positionPct: positionSizePct,
    });

  return {
    preferences: prefs,
    riskLevel,
    maxPositionSize: prefs.maxPositionSize,
    maxDailyTrades: prefs.maxDailyTrades ?? 5,
    stopLossPercentage: prefs.stopLossPercentage ?? 8,
    takeProfitPercentage: prefs.takeProfitPercentage ?? 15,
    positionSizePct,
    minStrategyScore,
    minVerifiedPerfScore: autoSettings.minVerifiedPerfScore ?? 7,
    highConfidenceThreshold: weights.highConfidenceThreshold,
    requireChartAudit: autoSettings.requireChartAudit !== false,
    applySelfAnalyzeGates: autoSettings.applySelfAnalyzeGates !== false,
    allowHighRisk: riskLevel === 'aggressive',
    allowMediumRisk: riskLevel !== 'conservative',
    learningWeights: weights,
    compoundHint: {
      positionPct: positionSizePct,
      projectedReturnPct: compoundHint.totalReturnPct,
      winRatePct: winRate,
      avgWinPct: avgWin,
      avgLossPct: avgLoss,
    },
  };
}

export function countAutoTradesToday(portfolio) {
  const today = new Date().toISOString().slice(0, 10);
  return (portfolio.trades ?? []).filter(
    (t) => t.auto && t.timestamp?.startsWith(today)
  ).length;
}

export function countAutoBuysToday(portfolio) {
  const today = new Date().toISOString().slice(0, 10);
  return (portfolio.trades ?? []).filter(
    (t) => t.auto && t.side === 'buy' && t.timestamp?.startsWith(today)
  ).length;
}

export function passesRiskLevel(stock, risk) {
  const level = stock?.riskLevel ?? 'medium';
  if (level === 'high' && !risk.allowHighRisk) return false;
  if (level === 'medium' && risk.riskLevel === 'conservative' && !risk.allowMediumRisk) return false;
  return true;
}

export function selfAnalyzeAllowsAutoTrade(report, risk) {
  if (!risk.applySelfAnalyzeGates || !report) return { allow: true, reason: 'No self-analyze gate' };
  const dir = report.stats?.directionAccuracy ?? 100;
  const graded = report.stats?.graded ?? 0;
  if (graded >= 5 && dir < 45) {
    return {
      allow: false,
      reason: `Self-analyze direction accuracy ${dir}% — pausing auto-buys until model improves`,
    };
  }
  return { allow: true, reason: 'Self-analyze gates passed' };
}
