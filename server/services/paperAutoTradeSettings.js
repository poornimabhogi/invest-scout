import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeCapSplitPcts } from './marketCapScale.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'paper-auto-trade.json');

const DEFAULT_SETTINGS = {
  enabled: false,
  accuracyMode: false,
  maxPositions: 8,
  positionSizePct: 8,
  minStrategyScore: 12,
  minVerifiedPerfScore: 7,
  minBullishIndicators: 0,
  maxBearishIndicators: 0,
  requireDualStructureForTopPick: false,
  buyTopPicks: true,
  buyChartVerified: true,
  buyPremiumEntry: true,
  buyLuxConfirmation: false,
  buyLuxStrongOnly: true,
  buyGainzAlgo: false,
  gainzAlgoMode: 'standard',
  gainzMinConfidence: 65,
  buyWvfCapitulation: false,
  wvfMinCoreBullish: 4,
  useCapSplitting: true,
  investmentAmount: 100_000,
  splitLargePct: 50,
  splitMidPct: 25,
  splitSmallPct: 25,
  sellOnAvoid: true,
  useStopLossTakeProfit: true,
  requireChartAudit: true,
  applySelfAnalyzeGates: true,
  cooldownHours: 24,
  lastRunAt: null,
  lastActions: [],
  strategyStats: {},
  lastIndicatorSnapshots: {},
  lastRiskContext: null,
};

/** Stricter entry funnel — fewer trades, higher confluence */
export const ACCURACY_MODE_PRESET = {
  accuracyMode: true,
  buyTopPicks: true,
  buyChartVerified: true,
  buyPremiumEntry: true,
  buyLuxConfirmation: true,
  buyLuxStrongOnly: true,
  minStrategyScore: 60,
  minVerifiedPerfScore: 10,
  minBullishIndicators: 4,
  maxBearishIndicators: 2,
  requireDualStructureForTopPick: true,
  requireChartAudit: true,
  applySelfAnalyzeGates: true,
  maxPositions: 5,
  positionSizePct: 5,
  cooldownHours: 48,
};

export const STANDARD_MODE_PRESET = {
  accuracyMode: false,
  buyTopPicks: true,
  buyChartVerified: true,
  buyPremiumEntry: true,
  buyLuxConfirmation: false,
  buyLuxStrongOnly: true,
  minStrategyScore: 12,
  minVerifiedPerfScore: 7,
  minBullishIndicators: 0,
  maxBearishIndicators: 0,
  requireDualStructureForTopPick: false,
  requireChartAudit: true,
  applySelfAnalyzeGates: true,
  maxPositions: 8,
  positionSizePct: 8,
  cooldownHours: 24,
};

export const ACCURACY_MODE_TRADING_PREFS = {
  riskLevel: 'conservative',
  maxDailyTrades: 2,
  stopLossPercentage: 8,
  takeProfitPercentage: 15,
};

function ensureDataDir() {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function getAutoTradeSettings() {
  ensureDataDir();
  if (!fs.existsSync(SETTINGS_FILE)) {
    const s = { ...DEFAULT_SETTINGS };
    saveAutoTradeSettings(s);
    return s;
  }
  return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) };
}

export function saveAutoTradeSettings(settings) {
  ensureDataDir();
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  return settings;
}

export function updateAutoTradeSettings(partial) {
  const current = getAutoTradeSettings();
  const next = { ...current, ...partial };

  if (
    partial.splitLargePct != null ||
    partial.splitMidPct != null ||
    partial.splitSmallPct != null
  ) {
    const normalized = normalizeCapSplitPcts(
      next.splitLargePct,
      next.splitMidPct,
      next.splitSmallPct
    );
    next.splitLargePct = normalized.large;
    next.splitMidPct = normalized.mid;
    next.splitSmallPct = normalized.small;
  }

  if (partial.investmentAmount != null) {
    next.investmentAmount = Math.max(0, Number(partial.investmentAmount) || 0);
  }

  saveAutoTradeSettings(next);
  return next;
}

export function applyAccuracyModePreset(enable = true) {
  const preset = enable ? ACCURACY_MODE_PRESET : STANDARD_MODE_PRESET;
  const current = getAutoTradeSettings();
  return updateAutoTradeSettings({ ...preset, enabled: current.enabled });
}
