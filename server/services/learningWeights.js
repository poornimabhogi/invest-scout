import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEARNINGS_FILE = path.join(__dirname, '..', 'data', 'strategy-learnings.json');

export const DEFAULT_WEIGHTS = {
  momentumMultiplier: 1,
  rsiOverboughtPenalty: 0.003,
  rsiOversoldBoost: 0.003,
  atrMultiplier: 0.8,
  confidenceFloor: 35,
  highConfidenceThreshold: 70,
  macdBullishBoost: 0.001,
  macdBearishPenalty: 0.001,
  trendAlignmentBoost: 0.0008,
  trendDamping: 0.35,
  pullbackDamping: 0.45,
};

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function clampLearningWeights(weights) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  return {
    ...w,
    momentumMultiplier: clamp(w.momentumMultiplier ?? 1, 0.75, 1.2),
    macdBearishPenalty: clamp(w.macdBearishPenalty ?? 0.001, 0.0005, 0.003),
    macdBullishBoost: clamp(w.macdBullishBoost ?? 0.001, 0.0003, 0.002),
    atrMultiplier: clamp(w.atrMultiplier ?? 0.8, 0.7, 1.4),
    highConfidenceThreshold: clamp(w.highConfidenceThreshold ?? 70, 65, 85),
    trendDamping: clamp(w.trendDamping ?? 0.35, 0.15, 0.65),
    pullbackDamping: clamp(w.pullbackDamping ?? 0.45, 0.2, 0.7),
    trendAlignmentBoost: clamp(w.trendAlignmentBoost ?? 0.0008, 0.0003, 0.002),
    rsiOverboughtPenalty: clamp(w.rsiOverboughtPenalty ?? 0.003, 0.002, 0.01),
    rsiOversoldBoost: clamp(w.rsiOversoldBoost ?? 0.003, 0.002, 0.01),
  };
}

export function getLearningWeights() {
  try {
    if (!fs.existsSync(LEARNINGS_FILE)) return clampLearningWeights(DEFAULT_WEIGHTS);
    const data = JSON.parse(fs.readFileSync(LEARNINGS_FILE, 'utf-8'));
    return clampLearningWeights(data.weights ?? {});
  } catch {
    return clampLearningWeights(DEFAULT_WEIGHTS);
  }
}
