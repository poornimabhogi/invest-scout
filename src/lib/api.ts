import {
  Stock,
  ScreenerView,
  CelebrityInvestor,
  ScreenerStatus,
} from '@/types/stock';
import {
  Candle,
  ChartRange,
  PerformanceStats,
  StockDetail,
  StrategyOpportunity,
} from '@/types/chart';
import { TradingPreferences, TradingRiskLevel } from '@/types/trading';
import { SmartMoneyAnalysis } from '@/types/smc';
import { PriceForecast, BacktestSummary, CompoundSimulation, SelfAnalyzeReport, SelfAnalyzeState } from '@/types/forecast';
import { PaperPortfolio } from '@/types/paper';
import { MediaRadarResponse } from '@/types/media';
import { WatchlistResponse, WatchlistSettingsUpdate } from '@/types/watchlist';

const API_BASE = '/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const msg =
      typeof data.error === 'string'
        ? data.error
        : response.status === 404
          ? 'API route not found — restart the dev server with npm run dev'
          : `Request failed (${response.status})`;
    throw new Error(data.message || msg);
  }

  return data as T;
}

export const api = {
  getMarketData(view: ScreenerView = 'all'): Promise<Stock[]> {
    const query = view === 'all' ? '' : `?view=${view}`;
    return request<Stock[]>(`/market-data${query}`);
  },

  getStrategies(refresh = false): Promise<StrategyOpportunity[]> {
    const query = refresh ? '?refresh=true' : '';
    return request<StrategyOpportunity[]>(`/strategies${query}`);
  },

  getStockDetail(symbol: string): Promise<StockDetail> {
    return request<StockDetail>(`/stocks/${symbol}`);
  },

  getCandles(
    symbol: string,
    range: ChartRange = '1Y'
  ): Promise<{ candles: Candle[]; performance: PerformanceStats; source: string; smc?: SmartMoneyAnalysis; msb?: import('@/types/msb').MarketStructureAnalysis; utBot?: import('@/types/utBot').UtBotAnalysis; ote?: import('@/types/ote').OptimalTradeEntryAnalysis }> {
    return request(`/stocks/${symbol}/candles?range=${range}`);
  },

  getCelebrities(): Promise<CelebrityInvestor[]> {
    return request<CelebrityInvestor[]>('/celebrities');
  },

  getScreenerStatus(): Promise<ScreenerStatus> {
    return request<ScreenerStatus>('/screener/status');
  },

  refreshScreener(): Promise<{ ok: boolean; lastUpdated: string; stockCount: number }> {
    return request('/screener/refresh', { method: 'POST' });
  },

  getTradingPreferences(): Promise<TradingPreferences | null> {
    return request<TradingPreferences | null>('/trading-preferences');
  },

  saveTradingPreferences(prefs: {
    maxPositionSize: number;
    riskLevel: TradingRiskLevel;
    maxDailyTrades: number;
    stopLossPercentage: number;
    takeProfitPercentage: number;
  }): Promise<TradingPreferences> {
    return request<TradingPreferences>('/trading-preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    });
  },

  getForecast(symbol: string): Promise<PriceForecast> {
    return request<PriceForecast>(`/stocks/${symbol}/forecast`);
  },

  getBacktestSummary(): Promise<BacktestSummary> {
    return request<BacktestSummary>('/backtest/summary');
  },

  simulateCompound(params: {
    startingCapital: number;
    winRatePct: number;
    avgWinPct: number;
    avgLossPct: number;
    tradesPerDay: number;
    days: number;
    positionPct?: number;
  }): Promise<CompoundSimulation> {
    return request<CompoundSimulation>('/compound/simulate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  getPaperPortfolio(): Promise<PaperPortfolio> {
    return request<PaperPortfolio>('/paper/portfolio');
  },

  paperBuy(symbol: string, shares: number, price: number, note?: string): Promise<PaperPortfolio> {
    return request<PaperPortfolio>('/paper/buy', {
      method: 'POST',
      body: JSON.stringify({ symbol, shares, price, note }),
    });
  },

  paperSell(symbol: string, shares: number, price: number, note?: string): Promise<PaperPortfolio> {
    return request<PaperPortfolio>('/paper/sell', {
      method: 'POST',
      body: JSON.stringify({ symbol, shares, price, note }),
    });
  },

  paperReset(startingCash = 100_000): Promise<PaperPortfolio> {
    return request<PaperPortfolio>('/paper/reset', {
      method: 'POST',
      body: JSON.stringify({ startingCash }),
    });
  },

  getPaperAutoTradeStatus(): Promise<import('@/types/paperAutoTrade').AutoTradeStatus> {
    return request('/paper/auto-trade');
  },

  updatePaperAutoTradeSettings(
    settings: Partial<import('@/types/paperAutoTrade').AutoTradeSettings>
  ): Promise<import('@/types/paperAutoTrade').AutoTradeStatus> {
    return request('/paper/auto-trade/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  runPaperAutoTrade(): Promise<import('@/types/paperAutoTrade').AutoTradeRunResult> {
    return request('/paper/auto-trade/run', { method: 'POST' });
  },

  getMediaRadar(): Promise<MediaRadarResponse> {
    return request<MediaRadarResponse>('/media-radar');
  },

  pollMediaRadar(): Promise<MediaRadarResponse> {
    return request<MediaRadarResponse>('/media-radar/poll', { method: 'POST' });
  },

  getSelfAnalyzeState(): Promise<SelfAnalyzeState> {
    return request<SelfAnalyzeState>('/self-analyze');
  },

  runSelfAnalyze(includeSimulation = true): Promise<SelfAnalyzeReport> {
    return request<SelfAnalyzeReport>('/self-analyze/run', {
      method: 'POST',
      body: JSON.stringify({ includeSimulation }),
    });
  },

  getWatchlist(): Promise<WatchlistResponse> {
    return request<WatchlistResponse>('/watchlist');
  },

  updateWatchlistSettings(settings: WatchlistSettingsUpdate): Promise<WatchlistResponse> {
    return request<WatchlistResponse>('/watchlist/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  pinWatchlistSymbol(symbol: string): Promise<WatchlistResponse> {
    return request<WatchlistResponse>(`/watchlist/pin/${symbol}`, { method: 'POST' });
  },

  unpinWatchlistSymbol(symbol: string): Promise<WatchlistResponse> {
    return request<WatchlistResponse>(`/watchlist/pin/${symbol}`, { method: 'DELETE' });
  },

  excludeWatchlistSymbol(symbol: string): Promise<WatchlistResponse> {
    return request<WatchlistResponse>(`/watchlist/exclude/${symbol}`, { method: 'POST' });
  },
};
