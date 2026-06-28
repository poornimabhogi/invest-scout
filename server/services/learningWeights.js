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
};

export function getLearningWeights() {
  try {
    if (!fs.existsSync(LEARNINGS_FILE)) return { ...DEFAULT_WEIGHTS };
    const data = JSON.parse(fs.readFileSync(LEARNINGS_FILE, 'utf-8'));
    return { ...DEFAULT_WEIGHTS, ...data.weights };
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}
