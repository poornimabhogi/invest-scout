import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORTFOLIO_FILE = path.join(__dirname, '..', 'data', 'paper-portfolio.json');
const DEFAULT_CASH = 100_000;

function ensureDataDir() {
  const dir = path.dirname(PORTFOLIO_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function defaultPortfolio() {
  return {
    cash: DEFAULT_CASH,
    startingCash: DEFAULT_CASH,
    positions: {},
    trades: [],
    createdAt: new Date().toISOString(),
  };
}

export function loadPortfolio() {
  ensureDataDir();
  if (!fs.existsSync(PORTFOLIO_FILE)) {
    const p = defaultPortfolio();
    savePortfolio(p);
    return p;
  }
  return JSON.parse(fs.readFileSync(PORTFOLIO_FILE, 'utf-8'));
}

export function savePortfolio(portfolio) {
  ensureDataDir();
  fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(portfolio, null, 2));
}

function recordTrade(portfolio, trade) {
  portfolio.trades.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...trade,
  });
}

export function buyShares(symbol, shares, price, note = '') {
  const sym = symbol.toUpperCase();
  const qty = Number(shares);
  const px = Number(price);
  if (!sym || qty <= 0 || px <= 0) throw new Error('Invalid buy order');

  const portfolio = loadPortfolio();
  const cost = qty * px;
  if (cost > portfolio.cash) throw new Error(`Insufficient cash. Need $${cost.toFixed(2)}, have $${portfolio.cash.toFixed(2)}`);

  portfolio.cash -= cost;
  const existing = portfolio.positions[sym] ?? { shares: 0, avgCost: 0 };
  const totalShares = existing.shares + qty;
  existing.avgCost = (existing.avgCost * existing.shares + cost) / totalShares;
  existing.shares = totalShares;
  portfolio.positions[sym] = existing;

  recordTrade(portfolio, {
    symbol: sym,
    side: 'buy',
    shares: qty,
    price: px,
    total: cost,
    note,
  });

  savePortfolio(portfolio);
  return portfolio;
}

export function sellShares(symbol, shares, price, note = '') {
  const sym = symbol.toUpperCase();
  const qty = Number(shares);
  const px = Number(price);
  if (!sym || qty <= 0 || px <= 0) throw new Error('Invalid sell order');

  const portfolio = loadPortfolio();
  const pos = portfolio.positions[sym];
  if (!pos || pos.shares < qty) {
    throw new Error(`Insufficient shares. Have ${pos?.shares ?? 0}, tried to sell ${qty}`);
  }

  const proceeds = qty * px;
  portfolio.cash += proceeds;
  pos.shares -= qty;
  if (pos.shares <= 0) delete portfolio.positions[sym];

  recordTrade(portfolio, {
    symbol: sym,
    side: 'sell',
    shares: qty,
    price: px,
    total: proceeds,
    note,
  });

  savePortfolio(portfolio);
  return portfolio;
}

export function resetPortfolio(startingCash = DEFAULT_CASH) {
  const p = defaultPortfolio();
  p.cash = startingCash;
  p.startingCash = startingCash;
  savePortfolio(p);
  return p;
}

export function enrichPortfolio(portfolio, priceMap) {
  const positions = Object.entries(portfolio.positions).map(([symbol, pos]) => {
    const currentPrice = priceMap[symbol] ?? pos.avgCost;
    const marketValue = pos.shares * currentPrice;
    const costBasis = pos.shares * pos.avgCost;
    const unrealizedPnL = marketValue - costBasis;
    const unrealizedPnLPct = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;
    return {
      symbol,
      shares: pos.shares,
      avgCost: Math.round(pos.avgCost * 100) / 100,
      currentPrice: Math.round(currentPrice * 100) / 100,
      marketValue: Math.round(marketValue * 100) / 100,
      costBasis: Math.round(costBasis * 100) / 100,
      unrealizedPnL: Math.round(unrealizedPnL * 100) / 100,
      unrealizedPnLPct: Math.round(unrealizedPnLPct * 100) / 100,
    };
  });

  const positionsValue = positions.reduce((s, p) => s + p.marketValue, 0);
  const totalEquity = portfolio.cash + positionsValue;
  const totalReturn = totalEquity - portfolio.startingCash;
  const totalReturnPct =
    portfolio.startingCash > 0 ? (totalReturn / portfolio.startingCash) * 100 : 0;

  const closedStats = computeClosedTradeStats(portfolio.trades);

  return {
    cash: Math.round(portfolio.cash * 100) / 100,
    startingCash: portfolio.startingCash,
    positions,
    positionsValue: Math.round(positionsValue * 100) / 100,
    totalEquity: Math.round(totalEquity * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
    totalReturnPct: Math.round(totalReturnPct * 100) / 100,
    trades: portfolio.trades.slice(0, 50),
    stats: closedStats,
  };
}

function computeClosedTradeStats(trades) {
  const buys = {};
  const closed = [];

  for (const t of [...trades].reverse()) {
    if (t.side === 'buy') {
      if (!buys[t.symbol]) buys[t.symbol] = [];
      buys[t.symbol].push({ shares: t.shares, price: t.price });
    } else if (t.side === 'sell') {
      let remaining = t.shares;
      let cost = 0;
      const queue = buys[t.symbol] ?? [];
      while (remaining > 0 && queue.length > 0) {
        const lot = queue[0];
        const used = Math.min(remaining, lot.shares);
        cost += used * lot.price;
        lot.shares -= used;
        remaining -= used;
        if (lot.shares <= 0) queue.shift();
      }
      const proceeds = t.shares * t.price;
      const pnl = proceeds - cost;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      closed.push({ win: pnl > 0, pnlPct });
    }
  }

  if (closed.length === 0) {
    return { closedTrades: 0, winRate: 0, avgWinPct: 0, avgLossPct: 0 };
  }

  const wins = closed.filter((c) => c.win);
  const losses = closed.filter((c) => !c.win);
  return {
    closedTrades: closed.length,
    winRate: Math.round((wins.length / closed.length) * 1000) / 10,
    avgWinPct:
      wins.length > 0
        ? Math.round((wins.reduce((s, c) => s + c.pnlPct, 0) / wins.length) * 100) / 100
        : 0,
    avgLossPct:
      losses.length > 0
        ? Math.round((losses.reduce((s, c) => s + c.pnlPct, 0) / losses.length) * 100) / 100
        : 0,
  };
}

export async function getEnrichedPortfolio(getPrices) {
  const portfolio = loadPortfolio();
  const priceMap = await getPrices(Object.keys(portfolio.positions));
  return enrichPortfolio(portfolio, priceMap);
}

export function getPriceFromStocks(stocks, symbol) {
  const s = stocks.find((x) => x.symbol === symbol);
  return s?.price ?? null;
}
