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
  if (!risk.requireChartAudit) return { ok: true, reason: 'Chart audit optional' };

  if (snapshot?.confirmsMedia) {
    return { ok: true, reason: snapshot.primaryReason ?? 'Cached indicator audit' };
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
    return { ok: false, reason: 'Could not run chart indicator audit' };
  }
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

  return null;
}

function calcBuyShares(equity, cash, price, risk) {
  const pct = (risk.positionSizePct ?? 8) / 100;
  let budget = equity * pct;
  const maxPos = risk.maxPositionSize;
  if (maxPos && maxPos > 0) budget = Math.min(budget, maxPos);
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

    for (const c of candidates) {
      if (held.has(c.symbol)) continue;
      if (enriched.positions.length + buyCount() >= maxPositions) break;
      if (buysToday + buyCount() >= dailyLimit) break;
      if (inCooldown(c.symbol, settings, portfolio)) continue;

      const stock = stockMap.get(c.symbol) ?? { symbol: c.symbol };
      const audit = await passesChartAudit(c.symbol, stock, c.indicatorSnapshot, risk);
      if (!audit.ok) continue;

      let price = c.price;
      try {
        price = await resolvePrice(c.symbol);
      } catch {
        continue;
      }
      if (!price || price <= 0) continue;

      const shares = calcBuyShares(enriched.totalEquity, enriched.cash, price, risk);
      if (shares <= 0) continue;

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
  };
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
