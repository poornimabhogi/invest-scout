import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUpIcon, TrendingDownIcon, MinusIcon, AlertTriangleIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ForecastPanelProps {
  symbol: string;
}

export function ForecastPanel({ symbol }: ForecastPanelProps) {
  const { data: forecast, isLoading } = useQuery({
    queryKey: ['forecast', symbol],
    queryFn: () => api.getForecast(symbol),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading forecast...</div>;
  if (!forecast) return null;

  const DirIcon =
    forecast.direction === 'up'
      ? TrendingUpIcon
      : forecast.direction === 'down'
        ? TrendingDownIcon
        : MinusIcon;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          Next-Day Estimate
          <Badge variant="outline" className="font-normal text-xs">
            {forecast.forecastDate}
          </Badge>
        </CardTitle>
        <CardDescription>Model-based range — not a guaranteed price</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold">${forecast.pointEstimate.toFixed(2)}</p>
            <p
              className={cn(
                'text-sm font-medium flex items-center gap-1',
                forecast.expectedChangePct >= 0 ? 'text-green-600' : 'text-red-600'
              )}
            >
              <DirIcon size={14} />
              {forecast.expectedChangePct >= 0 ? '+' : ''}
              {forecast.expectedChangePct.toFixed(2)}% expected
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="text-muted-foreground">Confidence</p>
            <p className="font-bold text-lg">{forecast.confidence}%</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-slate-50 rounded p-2">
            <p className="text-muted-foreground text-xs">Low range</p>
            <p className="font-semibold">${forecast.lowEstimate.toFixed(2)}</p>
          </div>
          <div className="bg-slate-50 rounded p-2">
            <p className="text-muted-foreground text-xs">High range</p>
            <p className="font-semibold">${forecast.highEstimate.toFixed(2)}</p>
          </div>
        </div>

        {forecast.backtest.sampleSize > 0 && (
          <div className="border-t pt-3 text-sm space-y-1">
            <p className="font-medium">Historical signal accuracy (90 days)</p>
            <div className="flex justify-between text-muted-foreground">
              <span>Win rate</span>
              <span className="font-semibold text-foreground">{forecast.backtest.winRate}%</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Avg win / loss</span>
              <span className="font-semibold text-foreground">
                +{forecast.backtest.avgWinPct}% / {forecast.backtest.avgLossPct}%
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Sample trades</span>
              <span>{forecast.backtest.sampleSize}</span>
            </div>
          </div>
        )}

        <div className="flex gap-2 text-xs text-amber-800 bg-amber-50 p-2 rounded">
          <AlertTriangleIcon size={14} className="shrink-0 mt-0.5" />
          <span>{forecast.disclaimer}</span>
        </div>
      </CardContent>
    </Card>
  );
}
