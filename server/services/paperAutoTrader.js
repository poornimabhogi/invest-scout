import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  loadPortfolio,
  buyShares,
  sellShares,
  getEnrichedPortfolio,
  getPaperClosedStats,
} from './paperPortfolio.js';
import { getAutoTradeSettings, updateAutoTradeSettings } from './paperAutoTradeSettings.js';
import { buildMergedScreener, getMediaProcessingResult, getMediaVerifiedSymbols } from './mediaSignalProcessor.js';
import { getScreenerData } from './screener.js';
import { getPortfolioBacktest } from './compound.js';
import {
  getRiskContext,
  countAutoBuysToday,
  passesRiskLevel,
  selfAnalyzeAllowsAutoTrade,
} from './riskManagement.js';
import { analyzeSymbolIndicators } from './chartStackAnalysis.js';
import { getLatestReport } from './learnings.js';

import { luxConfirmationQualifies } from './luxConfirmation.js';
import { gainzQualifies } from './gainzAlgo.js';
import { wvfCapitulationQualifies } from './williamsVixFix.js';
import {
  capSplitBucket,
  classifyMarketCapScale,
  computeCapSplitState,
  passesCapTierBuyGate,
} from './marketCapScale.js';

const RUN_COOLDOWN_MS = 10 * 60 * 1000;
let lastRunMs = 0;
let isRunning = false;

function roundShares(shares) {
  return Math.max(1, Math.floor(shares));
}

function inCooldown(symbol, settings, portfolio) {
  const hours = settings.cooldownHours ?? 24;
  const cutoff = Date.now() - hours * 3600 * 1000;
  const recentBuy = portfolio.trades.find(
    (t) =>
      t.symbol === symbol &&
      t.side === 'buy' &&
      new Date(t.timestamp).getTime() > cutoff
  );
  return Boolean(recentBuy);
}

function buildBuyCandidates(merged, settings, verifiedSet, risk) {
  const suggestionMap = new Map(
    (getMediaProcessingResult().suggestions ?? []).map((s) => [s.symbol, s])
  );
  const snapshots = settings.lastIndicatorSnapshots ?? {};

  const candidates = [];
  const seen = new Set();

  const add = (stock, strategy, signalReason, priority) => {
    if (!stock?.symbol || seen.has(stock.symbol)) return;
    if (!passesRiskLevel(stock, risk)) return;
    seen.add(stock.symbol);
    candidates.push({
      symbol: stock.symbol,
      price: stock.price,
      strategy,
      signalReason,
      priority,
      strategyScore: stock.strategyScore ?? suggestionMap.get(stock.symbol)?.strategyScore ?? 0,
      indicatorSnapshot: snapshots[stock.symbol] ?? null,
    });
  };

  const minScore = risk.minStrategyScore ?? settings.minStrategyScore ?? 12;
  const minPerf = risk.minVerifiedPerfScore ?? settings.minVerifiedPerfScore ?? 7;

  for (const stock of merged.topPicks ?? []) {
    const suggestion = suggestionMap.get(stock.symbol);
    const chartVerified = stock.chartVerified ?? verifiedSet.has(stock.symbol);
    const perf = stock.chartVerifiedPerfScore ?? suggestion?.verifiedPerfScore ?? 0;

    if (settings.buyPremiumEntry && stock.confluence?.premiumEntry) {
      add(stock, 'premium-entry', 'SMC + MSB + OTE premium entry', 100);
    } else if (settings.buyWvfCapitulation) {
      const wvf = stock.wvf ?? suggestionMap.get(stock.symbol)?.wvf;
      const auditChecks =
        stock.indicatorAudit?.checks ?? suggestionMap.get(stock.symbol)?.indicatorAudit?.checks;
      if (
        wvfCapitulationQualifies(wvf, {
          minCoreBullish: settings.wvfMinCoreBullish ?? 4,
          checks: auditChecks,
        })
      ) {
        add(
          stock,
          'wvf-capitulation',
          wvf.signals?.[0] ?? 'WVF capitulation + core indicator confluence',
          86 + (settings.wvfMinCoreBullish ?? 4)
        );
      }
    } else if (settings.buyGainzAlgo) {
      const mode = settings.gainzAlgoMode ?? 'standard';
      const pack = stock.gainzAlgo ?? suggestionMap.get(stock.symbol)?.gainzAlgo;
      const gainz = pack?.[mode] ?? pack?.standard;
      if (gainzQualifies(gainz, { mode, minConfidence: settings.gainzMinConfidence ?? 65 })) {
        add(
          stock,
          `gainz-${mode}`,
          gainz.checks?.[0] ?? gainz.signals?.[0] ?? `Gainz ${mode} buy`,
          92 + Math.min((gainz.confidence ?? 0) / 10, 8)
        );
      }
    } else if (settings.buyLuxConfirmation) {
      const lux = stock.luxConfirmation ?? suggestionMap.get(stock.symbol)?.luxConfirmation;
      if (
        luxConfirmationQualifies(lux, { strongOnly: settings.buyLuxStrongOnly !== false }) &&
        lux?.filters?.smartTrail?.pass &&
        lux?.filters?.trendStrength?.pass
      ) {
        add(
          stock,
          lux.isStrong ? 'lux-strong' : 'lux-confirmation',
          lux.signals?.[0] ?? 'Lux confirmation + Smart Trail filter',
          95 + (lux.classification ?? 0)
        );
      }
    } else if (settings.buyChartVerified && chartVerified && perf >= minPerf) {
      add(
        stock,
        'chart-verified',
        suggestion?.chartReason ?? stock.chartVerifiedReason ?? 'Chart-verified media pick',
        80 + perf
      );
    } else if (
      settings.buyTopPicks &&
      stock.isTopPick &&
      (stock.strategyRecommendation === 'buy' || (stock.strategyScore ?? 0) >= minScore)
    ) {
      add(stock, 'top-pick', `Top pick · score ${stock.strategyScore ?? '—'}`, 60 + (stock.strategyScore ?? 0));
    }
  }

  for (const s of getMediaProcessingResult().suggestions ?? []) {
    if (s.topPickEligible || s.confluence?.premiumEntry) {
      const stock = merged.stocks?.find((x) => x.symbol === s.symbol) ?? {
        symbol: s.symbol,
        price: s.price,
        strategyScore: s.strategyScore,
        confluence: s.confluence,
      };
      add(
        stock,
        s.confluence?.premiumEntry ? 'premium-entry' : 'chart-verified',
        s.chartReason,
        70 + (s.verifiedPerfScore ?? 0)
      );
    }
  }

  return candidates.sort((a, b) => b.priority - a.priority);
}

async function passesChartAudit(symbol, stock, snapshot, risk) {
  if (!risk.requireChartAudit) return { ok: true, reason: 'Chart audit optional', analysis: null };

  if (snapshot?.confirmsMedia) {
    return {
      ok: true,
      reason: snapshot.primaryReason ?? 'Cached indicator audit',
      analysis: {
        indicatorAudit: {
          confirmsMedia: true,
          primaryReason: snapshot.primaryReason,
          summary: snapshot.summary,
        },
        confluence: stock.confluence,
      },
    };
  }

  try {
    const analysis = await analyzeSymbolIndicators(symbol, stock);
    return analysis.indicatorAudit?.confirmsMedia
      ? { ok: true, reason: analysis.indicatorAudit.primaryReason, analysis }
      : {
          ok: false,
          reason: analysis.indicatorAudit?.rejectionReason ?? 'Chart audit did not confirm',
          analysis,
        };
  } catch {
    return { ok: false, reason: 'Could not run chart indicator audit', analysis: null };
  }
}

function passesTopPickQuality(stock, analysis, snapshot, settings) {
  const minBullish = settings.accuracyMode
    ? 4
    : (settings.minBullishIndicators ?? 0);
  const maxBearish = settings.accuracyMode
    ? 2
    : (settings.maxBearishIndicators ?? 0);
  const requireStructure =
    settings.accuracyMode || settings.requireDualStructureForTopPick;

  if (minBullish <= 0 && maxBearish <= 0 && !requireStructure && !settings.accuracyMode) {
    return { ok: true };
  }

  const summary = analysis?.indicatorAudit?.summary ?? snapshot?.summary;
  const bullish = summary?.bullish ?? 0;
  const bearish = summary?.bearish ?? 0;
  const confluence = analysis?.confluence ?? stock.confluence;

  if (settings.accuracyMode && stock.strategyRecommendation !== 'buy') {
    return { ok: false, reason: 'Accuracy mode requires strategy buy (not watch-only)' };
  }

  if (minBullish > 0 && bullish < minBullish) {
    return {
      ok: false,
      reason: `Top pick needs ${minBullish}/7 bullish indicators (has ${bullish})`,
    };
  }

  if (maxBearish > 0 && bearish > maxBearish) {
    return {
      ok: false,
      reason: `Too many bearish indicators (${bearish}/7, max ${maxBearish})`,
    };
  }

  if (requireStructure) {
    const hasStructure =
      confluence?.premiumEntry ||
      confluence?.tripleConfluence ||
      confluence?.dualStructure;
    if (!hasStructure) {
      return {
        ok: false,
        reason: 'Top pick requires dual structure (SMC+MSB) or premium OTE',
      };
    }
  }

  if (settings.accuracyMode && (stock.strategyScore ?? 0) < (settings.minStrategyScore ?? 60)) {
    return {
      ok: false,
      reason: `Strategy score ${stock.strategyScore ?? '—'} below accuracy minimum ${settings.minStrategyScore}`,
    };
  }

  return { ok: true };
}

function shouldSellPosition(pos, stock, risk, settings) {
  if (settings.useStopLossTakeProfit) {
    const sl = risk.stopLossPercentage ?? 8;
    const tp = risk.takeProfitPercentage ?? 15;
    if (pos.unrealizedPnLPct <= -sl) {
      return { strategy: 'stop-loss', signalReason: `Stop loss ${pos.unrealizedPnLPct.toFixed(1)}%` };
    }
    if (pos.unrealizedPnLPct >= tp) {
      return { strategy: 'take-profit', signalReason: `Take profit +${pos.unrealizedPnLPct.toFixed(1)}%` };
    }
  }

  if (settings.sellOnAvoid) {
    if (stock?.strategyRecommendation === 'avoid' || stock?.aiRecommendation === 'sell') {
      return { strategy: 'signal-exit', signalReason: 'Strategy turned avoid/sell' };
    }
  }

  if (settings.buyLuxConfirmation && stock?.luxConfirmation?.exitSignal) {
    return { strategy: 'lux-exit', signalReason: 'Lux exit — lost Smart Trail / confirmation' };
  }

  return null;
}

function calcBuyShares(equity, cash, price, risk, capState, capBucket) {
  const pct = (risk.positionSizePct ?? 8) / 100;
  let budget = equity * pct;
  const maxPos = risk.maxPositionSize;
  if (maxPos && maxPos > 0) budget = Math.min(budget, maxPos);

  if (capState?.enabled && capBucket && capBucket !== 'unknown') {
    const tierRemaining = capState.remaining[capBucket];
    if (tierRemaining != null) {
      if (tierRemaining <= 0) return 0;
      budget = Math.min(budget, tierRemaining);
    }
  }

  budget = Math.min(budget, cash * 0.95);
  if (budget < price) return 0;
  return roundShares(budget / price);
}

function aggregateStrategyStats(trades) {
  const stats = {};
  for (const t of trades) {
    const key = t.strategy || (t.auto ? 'auto' : 'manual');
    if (!stats[key]) stats[key] = { buys: 0, sells: 0, symbols: new Set() };
    stats[key][t.side === 'buy' ? 'buys' : 'sells'] += 1;
    stats[key].symbols.add(t.symbol);
  }
  return Object.fromEntries(
    Object.entries(stats).map(([k, v]) => [k, { buys: v.buys, sells: v.sells, symbols: [...v.symbols] }])
  );
}

export async function runPaperAutoTrade(resolvePrice, { force = false, fromSelfAnalyze = false } = {}) {
  if (isRunning) return { ok: false, error: 'Auto-trade already running' };

  const settings = getAutoTradeSettings();
  if (!settings.enabled && !force && !fromSelfAnalyze) {
    return { ok: true, skipped: true, reason: 'Auto-trade disabled' };
  }

  if (!force && !fromSelfAnalyze && lastRunMs && Date.now() - lastRunMs < RUN_COOLDOWN_MS) {
    return { ok: true, skipped: true, reason: 'Cooldown — ran recently' };
  }

  isRunning = true;
  lastRunMs = Date.now();
  const actions = [];
  const errors = [];

  try {
    const paperStats = getPaperClosedStats();
    const backtest = await getPortfolioBacktest().catch(() => null);
    const risk = getRiskContext({ paperStats, backtest });
    const selfAnalyzeState = getLatestReport();
    const selfGate = selfAnalyzeAllowsAutoTrade(selfAnalyzeState.report, risk);

    if (!selfGate.allow && !force) {
      return {
        ok: true,
        skipped: true,
        reason: selfGate.reason,
        riskGate: selfGate,
        riskContext: risk,
      };
    }

    const base = await getScreenerData();
    const merged = await buildMergedScreener(base, { processMedia: true });
    const stockMap = new Map((merged.stocks ?? []).map((s) => [s.symbol, s]));
    const verifiedSet = getMediaVerifiedSymbols();

    async function priceMapFor(symbols) {
      const map = {};
      await Promise.all(
        symbols.map(async (sym) => {
          try {
            map[sym] = await resolvePrice(sym);
          } catch {
            map[sym] = null;
          }
        })
      );
      return map;
    }

    let enriched = await getEnrichedPortfolio(priceMapFor);
    const portfolio = loadPortfolio();

    for (const pos of enriched.positions) {
      const stock = stockMap.get(pos.symbol);
      const exit = shouldSellPosition(pos, stock, risk, settings);
      if (!exit) continue;
      try {
        sellShares(pos.symbol, pos.shares, pos.currentPrice, `[Auto] ${exit.signalReason}`, {
          strategy: exit.strategy,
          auto: true,
          signalReason: exit.signalReason,
        });
        actions.push({
          side: 'sell',
          symbol: pos.symbol,
          shares: pos.shares,
          price: pos.currentPrice,
          strategy: exit.strategy,
          reason: exit.signalReason,
          at: new Date().toISOString(),
        });
      } catch (err) {
        errors.push({ symbol: pos.symbol, side: 'sell', error: err.message });
      }
    }

    enriched = await getEnrichedPortfolio(priceMapFor);

    const maxPositions = Math.min(settings.maxPositions ?? 8, risk.maxDailyTrades ?? 5);
    const held = new Set(enriched.positions.map((p) => p.symbol));
    const buyCount = () => actions.filter((a) => a.side === 'buy').length;
    const buysToday = countAutoBuysToday(loadPortfolio()) + buyCount();
    const dailyLimit = risk.maxDailyTrades ?? 5;

    const candidates = buildBuyCandidates(merged, settings, verifiedSet, risk);
    const capState = computeCapSplitState(settings, portfolio, enriched.positions, stockMap);

    for (const c of candidates) {
      if (held.has(c.symbol)) continue;
      if (enriched.positions.length + buyCount() >= maxPositions) break;
      if (buysToday + buyCount() >= dailyLimit) break;
      if (inCooldown(c.symbol, settings, portfolio)) continue;

      const stock = stockMap.get(c.symbol) ?? { symbol: c.symbol };
      const capBucket = capSplitBucket(
        stock.marketCapScale ?? classifyMarketCapScale(stock.marketCap)
      );

      if (settings.useCapSplitting) {
        const tierGate = passesCapTierBuyGate(stock, capBucket, c.strategy, settings);
        if (!tierGate.ok) continue;
        if (capBucket !== 'unknown' && (capState.remaining[capBucket] ?? 0) <= 0) continue;
      }

      const audit = await passesChartAudit(c.symbol, stock, c.indicatorSnapshot, risk);
      if (!audit.ok) continue;

      if (c.strategy === 'top-pick') {
        const qualitySettings =
          settings.useCapSplitting && capBucket === 'large'
            ? {
                ...settings,
                accuracyMode: true,
                minBullishIndicators: 4,
                maxBearishIndicators: 2,
                requireDualStructureForTopPick: true,
              }
            : settings;
        const quality = passesTopPickQuality(stock, audit.analysis, c.indicatorSnapshot, qualitySettings);
        if (!quality.ok) continue;
      }

      let price = c.price;
      try {
        price = await resolvePrice(c.symbol);
      } catch {
        continue;
      }
      if (!price || price <= 0) continue;

      const shares = calcBuyShares(enriched.totalEquity, enriched.cash, price, risk, capState, capBucket);
      if (shares <= 0) continue;

      const buyCost = shares * price;
      if (settings.useCapSplitting && capBucket !== 'unknown') {
        capState.remaining[capBucket] = Math.max(0, (capState.remaining[capBucket] ?? 0) - buyCost);
        capState.deployed[capBucket] = (capState.deployed[capBucket] ?? 0) + buyCost;
      }

      const reason = audit.reason ? `${c.signalReason} · ${audit.reason}` : c.signalReason;

      try {
        buyShares(c.symbol, shares, price, `[Auto] ${reason}`, {
          strategy: c.strategy,
          auto: true,
          signalReason: reason,
        });
        held.add(c.symbol);
        actions.push({
          side: 'buy',
          symbol: c.symbol,
          shares,
          price,
          strategy: c.strategy,
          reason,
          at: new Date().toISOString(),
        });
      } catch (err) {
        errors.push({ symbol: c.symbol, side: 'buy', error: err.message });
      }
    }

    const finalPortfolio = loadPortfolio();
    const strategyStats = aggregateStrategyStats(finalPortfolio.trades);

    updateAutoTradeSettings({
      lastRunAt: new Date().toISOString(),
      lastActions: [...actions, ...(getAutoTradeSettings().lastActions ?? [])].slice(0, 30),
      strategyStats,
      lastRiskContext: {
        riskLevel: risk.riskLevel,
        positionSizePct: risk.positionSizePct,
        maxDailyTrades: risk.maxDailyTrades,
        minStrategyScore: risk.minStrategyScore,
        compoundHint: risk.compoundHint,
      },
    });

    return {
      ok: true,
      ranAt: new Date().toISOString(),
      actions,
      errors,
      strategyStats,
      candidatesScanned: candidates.length,
      riskContext: risk,
      riskGate: selfGate,
      capAllocation: capState,
      settings: getAutoTradeSettings(),
    };
  } finally {
    isRunning = false;
  }
}

export function getAutoTradeStatus() {
  const settings = getAutoTradeSettings();
  const portfolio = loadPortfolio();
  const paperStats = getPaperClosedStats();
  const risk = getRiskContext({ paperStats });
  const selfAnalyzeState = getLatestReport();
  const selfGate = selfAnalyzeAllowsAutoTrade(selfAnalyzeState.report, risk);
  const stockMap = getScreenerStockMapSync();
  const capAllocation = computeCapSplitState(
    settings,
    portfolio,
    buildCapSplitPositions(portfolio, stockMap),
    stockMap
  );

  return {
    settings,
    strategyStats: settings.strategyStats ?? aggregateStrategyStats(portfolio.trades),
    recentAutoTrades: portfolio.trades.filter((t) => t.auto).slice(0, 20),
    isRunning,
    riskContext: settings.lastRiskContext ?? {
      riskLevel: risk.riskLevel,
      positionSizePct: risk.positionSizePct,
      maxDailyTrades: risk.maxDailyTrades,
      minStrategyScore: risk.minStrategyScore,
      compoundHint: risk.compoundHint,
    },
    selfAnalyzeGate: selfGate,
    autoBuysToday: countAutoBuysToday(portfolio),
    capAllocation,
  };
}

function getScreenerStockMapSync() {
  try {
    const cachePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'screener-cache.json');
    if (!fs.existsSync(cachePath)) return new Map();
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    return new Map((cache.stocks ?? []).map((s) => [s.symbol, s]));
  } catch {
    return new Map();
  }
}

function buildCapSplitPositions(portfolio, stockMap) {
  return Object.entries(portfolio.positions ?? {}).map(([symbol, pos]) => {
    const stock = stockMap.get(symbol);
    const price = stock?.price ?? pos.avgCost;
    return {
      symbol,
      costBasis: pos.shares * pos.avgCost,
      marketValue: pos.shares * price,
    };
  });
}

export function startPaperAutoTradeMonitor(resolvePrice, intervalMs = 15 * 60 * 1000) {
  console.log(`Paper auto-trade: checking every ${intervalMs / 60000} min when enabled`);

  const tick = () => {
    runPaperAutoTrade(resolvePrice).catch((err) =>
      console.warn('Paper auto-trade run failed:', err.message)
    );
  };

  setInterval(tick, intervalMs);
  setTimeout(tick, 45_000);
}
