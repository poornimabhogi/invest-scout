import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { RefreshCwIcon, RotateCcwIcon } from 'lucide-react';
import { PaperAutoTradePanel } from '@/components/PaperAutoTradePanel';

interface PaperTradePanelProps {
  symbol: string;
  price: number;
  recommendation?: string;
}

export function PaperTradePanel({ symbol, price, recommendation }: PaperTradePanelProps) {
  const [shares, setShares] = useState('1');
  const queryClient = useQueryClient();

  const { data: portfolio, isError: portfolioError } = useQuery({
    queryKey: ['paperPortfolio'],
    queryFn: () => api.getPaperPortfolio(),
    retry: 1,
    refetchInterval: 60_000,
  });

  const position = portfolio?.positions.find((p) => p.symbol === symbol);
  const cash = portfolio?.cash ?? 100_000;
  const maxBuyShares = price > 0 ? Math.floor(cash / price) : 0;
  const shareQty = parseFloat(shares) || 0;
  const canBuy = price > 0 && shareQty > 0 && shareQty <= maxBuyShares;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['paperPortfolio'] });
  };

  const handleBuy = async () => {
    if (!canBuy) {
      toast.error(
        portfolioError
          ? 'Paper trade API unavailable — restart with npm run dev'
          : `Cannot buy ${shareQty} shares (max ${maxBuyShares}, cash $${cash.toFixed(0)})`
      );
      return;
    }
    try {
      await api.paperBuy(symbol, shareQty, price, `Manual buy — ${recommendation ?? 'signal'}`);
      toast.success(`Bought ${shareQty} ${symbol} @ $${price.toFixed(2)}`);
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Buy failed');
    }
  };

  const handleSell = async (qty?: number) => {
    const toSell = qty ?? shareQty;
    if (toSell <= 0) return;
    try {
      await api.paperSell(symbol, toSell, price, 'Manual sell');
      toast.success(`Sold ${toSell} ${symbol} @ $${price.toFixed(2)}`);
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Sell failed');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Paper Trade</CardTitle>
        <CardDescription>Simulated order at current price — no real money</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor="shares">Shares</Label>
          <Input
            id="shares"
            type="number"
            min="0.01"
            step="1"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            ≈ ${(parseFloat(shares || '0') * price).toFixed(2)} · max buy {maxBuyShares} shares
          </p>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" onClick={handleBuy} disabled={!canBuy && !portfolioError}>
            Buy
          </Button>
          <Button
            className="flex-1"
            variant="outline"
            onClick={() => handleSell()}
            disabled={!position?.shares}
          >
            Sell
          </Button>
          {position && position.shares > 0 && (
            <Button variant="secondary" onClick={() => handleSell(position.shares)}>
              Sell all
            </Button>
          )}
        </div>

        {position && (
          <div className="text-sm bg-slate-50 rounded p-2">
            Holding {position.shares} @ avg ${position.avgCost.toFixed(2)}
            {position.priceIsLive !== false && position.currentPrice != null && (
              <> · now ${position.currentPrice.toFixed(2)}</>
            )}
            {' · '}
            <span className={cn(position.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600')}>
              {position.unrealizedPnLPct >= 0 ? '+' : ''}
              {position.unrealizedPnLPct.toFixed(2)}%
            </span>
          </div>
        )}

        {portfolioError && (
          <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
            Paper API not loaded — stop the server (Ctrl+C) and run <strong>npm run dev</strong> again.
          </p>
        )}

        {portfolio && (
          <p className="text-xs text-muted-foreground">Cash available: ${portfolio.cash.toLocaleString()}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function PaperPortfolioPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: portfolio, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['paperPortfolio'],
    queryFn: () => api.getPaperPortfolio(),
    refetchInterval: 60_000,
  });

  const handleReset = async () => {
    if (!confirm('Reset paper portfolio to $100,000? All positions and history will be cleared.')) return;
    try {
      await api.paperReset(100_000);
      toast.success('Paper portfolio reset');
      queryClient.invalidateQueries({ queryKey: ['paperPortfolio'] });
    } catch {
      toast.error('Reset failed');
    }
  };

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading paper portfolio...</div>;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Paper Portfolio</CardTitle>
            <CardDescription>Track simulated trades and live signal accuracy</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCwIcon size={14} className={cn(isFetching && 'animate-spin')} />
            </Button>
            <Button size="sm" variant="outline" onClick={handleReset}>
              <RotateCcwIcon size={14} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <PaperAutoTradePanel />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Total equity</p>
            <p className="text-xl font-bold">${portfolio?.totalEquity.toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Total return</p>
            <p
              className={cn(
                'text-xl font-bold',
                (portfolio?.totalReturnPct ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'
              )}
            >
              {(portfolio?.totalReturnPct ?? 0) >= 0 ? '+' : ''}
              {portfolio?.totalReturnPct.toFixed(2)}%
            </p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Cash</p>
            <p className="text-xl font-bold">${portfolio?.cash.toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Closed win rate</p>
            <p className="text-xl font-bold">
              {portfolio?.stats.closedTrades ? `${portfolio.stats.winRate}%` : '—'}
            </p>
            {portfolio?.stats.closedTrades ? (
              <p className="text-xs text-muted-foreground">{portfolio.stats.closedTrades} trades</p>
            ) : null}
          </div>
        </div>

        {portfolio?.stats.closedTrades ? (
          <div className="text-sm text-muted-foreground bg-blue-50 p-3 rounded-lg">
            Live paper trading: {portfolio.stats.winRate}% win rate on closed trades · avg win{' '}
            +{portfolio.stats.avgWinPct}% / loss {portfolio.stats.avgLossPct}%
          </div>
        ) : null}

        {portfolio?.pricesRefreshedAt && (
          <p className="text-xs text-muted-foreground">
            Prices refreshed {new Date(portfolio.pricesRefreshedAt).toLocaleTimeString()} · live
            Finnhub/Yahoo quotes (updates every ~60s)
          </p>
        )}

        <div>
          <h3 className="font-semibold mb-2 text-sm">Open positions</h3>
          {!portfolio?.positions.length ? (
            <p className="text-sm text-muted-foreground">
              No positions yet. Click a stock and use Paper Trade to buy.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2">Symbol</th>
                    <th>Shares</th>
                    <th>Avg cost</th>
                    <th>Price</th>
                    <th>P&L</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.positions.map((p) => (
                    <tr key={p.symbol} className="border-b">
                      <td className="py-2 font-medium">{p.symbol}</td>
                      <td>{p.shares}</td>
                      <td>${p.avgCost.toFixed(2)}</td>
                      <td>${p.currentPrice.toFixed(2)}</td>
                      <td
                        className={cn(
                          'font-medium',
                          p.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'
                        )}
                      >
                        {p.unrealizedPnLPct >= 0 ? '+' : ''}
                        {p.unrealizedPnLPct.toFixed(2)}%
                        {p.priceIsLive === false && (
                          <span className="text-muted-foreground font-normal text-xs ml-1">(est.)</span>
                        )}
                      </td>
                      <td>
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/stock/${p.symbol}`)}>
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="font-semibold mb-2 text-sm">Recent trades</h3>
          {!portfolio?.trades.length ? (
            <p className="text-sm text-muted-foreground">No trades yet.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {portfolio.trades.slice(0, 15).map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm border rounded p-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={t.side === 'buy' ? 'default' : 'secondary'}>{t.side}</Badge>
                    {t.auto && (
                      <Badge variant="outline" className="text-[10px] text-violet-700">
                        auto
                      </Badge>
                    )}
                    {t.strategy && t.strategy !== 'manual' && (
                      <Badge variant="outline" className="text-[10px]">
                        {t.strategy}
                      </Badge>
                    )}
                    <span className="font-medium">{t.symbol}</span>
                    <span className="text-muted-foreground">
                      {t.shares} @ ${t.price.toFixed(2)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(t.timestamp).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
