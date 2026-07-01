/** US-style market cap tiers (USD). */
export const CAP_THRESHOLDS = {
  large: 10_000_000_000,
  mid: 2_000_000_000,
  small: 300_000_000,
};

export const CAP_LABELS = {
  large: 'Large cap',
  mid: 'Mid cap',
  small: 'Small cap',
  micro: 'Micro cap',
  unknown: 'Unknown cap',
};

/**
 * @param {number | null | undefined} marketCap
 * @returns {'large' | 'mid' | 'small' | 'micro' | 'unknown'}
 */
export function classifyMarketCapScale(marketCap) {
  const cap = Number(marketCap);
  if (!cap || cap <= 0) return 'unknown';
  if (cap >= CAP_THRESHOLDS.large) return 'large';
  if (cap >= CAP_THRESHOLDS.mid) return 'mid';
  if (cap >= CAP_THRESHOLDS.small) return 'small';
  return 'micro';
}

export function normalizeCapSplitPcts(largePct, midPct, smallPct) {
  const l = Math.max(0, Number(largePct) || 0);
  const m = Math.max(0, Number(midPct) || 0);
  const s = Math.max(0, Number(smallPct) || 0);
  const sum = l + m + s;
  if (sum <= 0) return { large: 50, mid: 25, small: 25 };
  return {
    large: Math.round((l / sum) * 1000) / 10,
    mid: Math.round((m / sum) * 1000) / 10,
    small: Math.round((s / sum) * 1000) / 10,
  };
}

/** Buckets used for auto-trade allocation (micro rolls into small). */
export function capSplitBucket(scale) {
  if (scale === 'large' || scale === 'mid') return scale;
  if (scale === 'small' || scale === 'micro') return 'small';
  return 'unknown';
}

/**
 * @param {object} settings
 * @param {object} portfolio
 * @param {Array<{ symbol: string, costBasis?: number, marketValue?: number }>} positions
 * @param {Map<string, { marketCap?: number, marketCapScale?: string }>} stockMap
 */
export function computeCapSplitState(settings, portfolio, positions, stockMap) {
  const investmentAmount = Number(settings.investmentAmount) || portfolio.startingCash || 100_000;
  const splits = normalizeCapSplitPcts(
    settings.splitLargePct ?? 50,
    settings.splitMidPct ?? 25,
    settings.splitSmallPct ?? 25
  );

  const budgets = {
    large: (investmentAmount * splits.large) / 100,
    mid: (investmentAmount * splits.mid) / 100,
    small: (investmentAmount * splits.small) / 100,
  };

  const deployed = { large: 0, mid: 0, small: 0 };

  for (const pos of positions ?? []) {
    const stock = stockMap?.get?.(pos.symbol);
    const scale = capSplitBucket(stock?.marketCapScale ?? classifyMarketCapScale(stock?.marketCap));
    if (scale === 'unknown') continue;
    deployed[scale] += pos.costBasis ?? pos.marketValue ?? 0;
  }

  const remaining = {
    large: Math.max(0, budgets.large - deployed.large),
    mid: Math.max(0, budgets.mid - deployed.mid),
    small: Math.max(0, budgets.small - deployed.small),
  };

  const totalDeployed = deployed.large + deployed.mid + deployed.small;

  return {
    enabled: Boolean(settings.useCapSplitting),
    investmentAmount,
    splits,
    budgets: roundMoney(budgets),
    deployed: roundMoney(deployed),
    remaining: roundMoney(remaining),
    totalDeployed: Math.round(totalDeployed * 100) / 100,
    totalRemaining: Math.round((investmentAmount - totalDeployed) * 100) / 100,
  };
}

function roundMoney(obj) {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, Math.round(v * 100) / 100])
  );
}

/** Large tier uses the existing conservative / accuracy-style funnel. */
export const LARGE_CAP_SAFE_STRATEGIES = new Set([
  'premium-entry',
  'chart-verified',
  'lux-strong',
  'lux-confirmation',
  'top-pick',
]);

export function passesCapTierBuyGate(stock, capBucket, strategy, settings) {
  if (!settings.useCapSplitting) return { ok: true };

  if (capBucket === 'unknown') {
    return { ok: false, reason: 'Market cap unknown — skipped for cap split' };
  }

  if (capBucket === 'large') {
    if (!LARGE_CAP_SAFE_STRATEGIES.has(strategy)) {
      return { ok: false, reason: 'Large-cap bucket only allows safe strategies (verified / Lux / top pick)' };
    }
    if (stock.strategyRecommendation === 'avoid') {
      return { ok: false, reason: 'Large-cap safe path requires non-avoid strategy' };
    }
    return { ok: true };
  }

  if (capBucket === 'mid') {
    if (stock.strategyRecommendation === 'avoid') {
      return { ok: false, reason: 'Mid-cap path skips avoid signals' };
    }
    const minScore = (settings.minStrategyScore ?? 12) * 0.6;
    const score = stock.strategyScore ?? 0;
    if (stock.strategyRecommendation !== 'buy' && score < minScore) {
      return { ok: false, reason: `Mid-cap needs buy or strategy score ≥ ${Math.round(minScore)}` };
    }
    return { ok: true };
  }

  // small (+ micro)
  if (stock.strategyRecommendation === 'avoid' || stock.aiRecommendation === 'sell') {
    return { ok: false, reason: 'Small-cap path skips avoid/sell' };
  }
  const minScore = (settings.minStrategyScore ?? 12) * 0.4;
  const score = stock.strategyScore ?? 0;
  if (stock.strategyRecommendation !== 'buy' && score < minScore) {
    return { ok: false, reason: `Small-cap needs buy or strategy score ≥ ${Math.round(minScore)}` };
  }
  return { ok: true };
}
