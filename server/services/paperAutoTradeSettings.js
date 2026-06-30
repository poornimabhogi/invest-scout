import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'paper-auto-trade.json');

const DEFAULT_SETTINGS = {
  enabled: false,
  maxPositions: 8,
  positionSizePct: 8,
  minStrategyScore: 12,
  minVerifiedPerfScore: 7,
  buyTopPicks: true,
  buyChartVerified: true,
  buyPremiumEntry: true,
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
  saveAutoTradeSettings(next);
  return next;
}
