import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CandlestickChart } from '@/components/charts/CandlestickChart';
import { api } from '@/lib/api';
import { ChartRange } from '@/types/chart';
import { ForecastPanel } from '@/components/ForecastPanel';
import { PaperTradePanel } from '@/components/PaperPortfolio';
import { cn } from '@/lib/utils';

const RANGES: ChartRange[] = ['1D', '1W', '1M', '3M', '1Y', '5Y', 'MAX'];

const StockDetail = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();
  const [range, setRange] = useState<ChartRange>('1Y');

  const { data: detail, isLoading, error } = useQuery({
    queryKey: ['stockDetail', symbol],
    queryFn: () => api.getStockDetail(symbol!),
    enabled: !!symbol,
  });

  const { data: candleData, isLoading: candlesLoading } = useQuery({
    queryKey: ['candles', symbol, range],
    queryFn: () => api.getCandles(symbol!, range),
    enabled: !!symbol,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCwIcon className="animate-spin" size={32} />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-red-600 font-medium">Failed to load {symbol}</p>
        <p className="text-sm text-muted-foreground max-w-md">
          The API server may be out of date or not running. Stop the dev server (Ctrl+C) and run{' '}
          <code className="bg-slate-100 px-1 rounded">npm run dev</code> again.
        </p>
        <Button onClick={() => navigate('/')}>Back to Screener</Button>
      </div>
    );
  }

  const { stock, performance, analysis, news, strategy } = detail;
  const candles = candleData?.candles ?? detail.candles;
  const perf = candleData?.performance ?? performance;
  const chartSource = candleData?.source ?? detail.dataSource;

  return (
    <div className="min-h-screen bg-trading-background">
      <div className="container py-8">
        <Button variant="ghost" onClick={() => navigate('/')} className="mb-4 gap-2">
          <ArrowLeftIcon size={16} />
          Back to Screener
        </Button>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold">{stock.symbol}</h1>
              <Badge variant="outline">{stock.sector}</Badge>
              <Badge
                className={cn(
                  strategy.recommendation === 'buy' && 'bg-green-100 text-green-800',
                  strategy.recommendation === 'watch' && 'bg-yellow-100 text-yellow-800',
                  strategy.recommendation === 'avoid' && 'bg-red-100 text-red-800'
                )}
              >
                {strategy.recommendation.toUpperCase()}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">{stock.name}</p>
            <div className="flex items-baseline gap-3 mt-2">
              <span className="text-4xl font-bold">${stock.price.toFixed(2)}</span>
              <span
                className={cn(
                  'text-lg font-semibold',
                  stock.changePercentage >= 0 ? 'text-green-600' : 'text-red-600'
                )}
              >
                {stock.changePercentage >= 0 ? '+' : ''}
                {stock.changePercentage.toFixed(2)}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Lifetime', value: perf.lifetime },
              { label: '5 Year', value: perf.fiveYear },
              { label: '1 Year', value: perf.oneYear },
              { label: 'YTD', value: perf.ytd },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-lg p-3 border text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p
                  className={cn(
                    'text-lg font-bold',
                    value >= 0 ? 'text-green-600' : 'text-red-600'
                  )}
                >
                  {value >= 0 ? '+' : ''}
                  {value.toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border p-4 mb-6">
          <div className="flex flex-wrap gap-2 mb-4">
            {RANGES.map((r) => (
              <Button
                key={r}
                size="sm"
                variant={range === r ? 'default' : 'outline'}
                onClick={() => setRange(r)}
              >
                {r}
              </Button>
            ))}
          </div>
          {candlesLoading ? (
            <div className="h-[400px] flex items-center justify-center bg-slate-50 rounded">
              <RefreshCwIcon className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <CandlestickChart candles={candles} height={420} />
              {chartSource === 'seed' && (
                <p className="text-xs text-amber-600 mt-2">
                  Chart uses estimated data — live history unavailable for this symbol.
                </p>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg border p-5">
              <h2 className="font-semibold mb-3">Chart Analysis</h2>
              <p className="text-sm text-muted-foreground mb-2">
                Pattern: <strong>{analysis.pattern}</strong> · RSI: <strong>{analysis.rsi}</strong>
              </p>
              <ul className="space-y-1">
                {analysis.signals.map((s) => (
                  <li key={s} className="text-sm flex items-start gap-2">
                    <span className="text-sky-600">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-lg border p-5">
              <h2 className="font-semibold mb-3">Latest News</h2>
              {news.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent news found.</p>
              ) : (
                <div className="space-y-3">
                  {news.map((item) => (
                    <a
                      key={item.url}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 rounded-lg hover:bg-slate-50 border"
                    >
                      <p className="font-medium text-sm">{item.headline}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.source} · {new Date(item.datetime).toLocaleDateString()}
                      </p>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <ForecastPanel symbol={stock.symbol} />

            <PaperTradePanel
              symbol={stock.symbol}
              price={stock.price}
              recommendation={strategy.recommendation}
            />

            <div className="bg-white rounded-lg border p-5">
              <h2 className="font-semibold mb-3">Strategy Signal</h2>
              <p className="text-sm text-muted-foreground mb-3">{strategy.rationale}</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Strategy Score</span>
                  <strong>{strategy.score}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Momentum</span>
                  <strong>{stock.momentumScore}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Celebrity Overlap</span>
                  <strong>{stock.celebrityScore}</strong>
                </div>
                {analysis.sma50 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">50-day MA</span>
                    <strong>${analysis.sma50.toFixed(2)}</strong>
                  </div>
                )}
                {analysis.sma200 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">200-day MA</span>
                    <strong>${analysis.sma200.toFixed(2)}</strong>
                  </div>
                )}
              </div>
            </div>

            {stock.celebrityHolders.length > 0 && (
              <div className="bg-white rounded-lg border p-5">
                <h2 className="font-semibold mb-3">Celebrity Holders</h2>
                <div className="flex flex-wrap gap-2">
                  {stock.celebrityHolders.map((h) => (
                    <Badge key={h.id} variant="secondary">
                      {h.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 bg-yellow-50 rounded-lg text-xs text-yellow-800">
              Not financial advice. Strategy signals combine chart patterns, news sentiment, and
              momentum algorithms for research purposes only.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockDetail;
