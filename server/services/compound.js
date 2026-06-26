import { getCandles } from './candles.js';
import { getScreenerData } from './screener.js';
import { forecastNextDay, backtestSymbol, simulateCompounding } from './forecast.js';

export async function getStockForecast(symbol) {
  const sym = symbol.toUpperCase();
  const screener = await getScreenerData();
  const stock = screener.stocks?.find((s) => s.symbol === sym);
  const { candles } = await getCandles(sym, '1Y');
  return forecastNextDay(candles, stock ?? { symbol: sym, price: candles.at(-1)?.close });
}

export async function getPortfolioBacktest() {
  const screener = await getScreenerData();
  const picks = (screener.topPicks ?? screener.stocks ?? []).slice(0, 15);

  let totalTrades = 0;
  let totalWins = 0;
  let winSum = 0;
  let lossSum = 0;
  let winCount = 0;
  let lossCount = 0;

  for (const stock of picks) {
    try {
      const { candles } = await getCandles(stock.symbol, '1Y');
      const bt = backtestSymbol(candles);
      if (bt.sampleSize === 0) continue;
      totalTrades += bt.sampleSize;
      totalWins += Math.round((bt.winRate / 100) * bt.sampleSize);
      if (bt.avgWinPct > 0) {
        winSum += bt.avgWinPct;
        winCount++;
      }
      if (bt.avgLossPct < 0) {
        lossSum += bt.avgLossPct;
        lossCount++;
      }
    } catch {
      /* skip */
    }
  }

  const winRate = totalTrades > 0 ? Math.round((totalWins / totalTrades) * 1000) / 10 : 0;
  const avgWinPct = winCount > 0 ? Math.round((winSum / winCount) * 100) / 100 : 1.5;
  const avgLossPct = lossCount > 0 ? Math.round((lossSum / lossCount) * 100) / 100 : -1.2;

  return {
    winRate,
    avgWinPct,
    avgLossPct,
    sampleTrades: totalTrades,
    symbolsTested: picks.length,
    disclaimer:
      'Backtest on recent history for top-pick signals. Win rate is historical — NOT a guarantee of future performance.',
  };
}

export function runCompoundSimulation(params) {
  return simulateCompounding(params);
}
