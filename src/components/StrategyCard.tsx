import { StrategyOpportunity } from '@/types/chart';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUpIcon, EyeIcon, BanIcon, NewspaperIcon, LineChartIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MiniChart } from '@/components/charts/MiniChart';

interface StrategyCardProps {
  strategy: StrategyOpportunity;
}

const recConfig = {
  buy: { icon: TrendingUpIcon, color: 'bg-green-100 text-green-800', label: 'Buy Opportunity' },
  watch: { icon: EyeIcon, color: 'bg-yellow-100 text-yellow-800', label: 'Watch List' },
  avoid: { icon: BanIcon, color: 'bg-red-100 text-red-800', label: 'Avoid' },
};

export function StrategyCard({ strategy }: StrategyCardProps) {
  const navigate = useNavigate();
  const rec = recConfig[strategy.recommendation];
  const RecIcon = rec.icon;

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow border">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold">{strategy.symbol}</h3>
            <Badge className={cn('text-xs', rec.color)}>
              <RecIcon size={12} className="mr-1" />
              {rec.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{strategy.name}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">${strategy.price.toFixed(2)}</p>
          <p
            className={cn(
              'text-sm font-medium',
              strategy.changePercentage >= 0 ? 'text-green-600' : 'text-red-600'
            )}
          >
            {strategy.changePercentage >= 0 ? '+' : ''}
            {strategy.changePercentage.toFixed(2)}%
          </p>
        </div>
      </div>

      <MiniChart symbol={strategy.symbol} />

      <p className="text-sm text-muted-foreground mt-3 mb-3">{strategy.rationale}</p>

      <div className="space-y-2 mb-4">
        <div className="flex items-start gap-2 text-xs">
          <LineChartIcon size={14} className="text-sky-600 mt-0.5 shrink-0" />
          <div>
            <span className="font-medium">{strategy.chartPattern}</span>
            <span className="text-muted-foreground"> · RSI {strategy.rsi}</span>
            {strategy.chartSignals.slice(0, 2).map((s) => (
              <p key={s} className="text-muted-foreground mt-0.5">{s}</p>
            ))}
          </div>
        </div>
        {strategy.recentNews[0] && (
          <div className="flex items-start gap-2 text-xs">
            <NewspaperIcon size={14} className="text-violet-600 mt-0.5 shrink-0" />
            <a
              href={strategy.recentNews[0].url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground line-clamp-2"
            >
              {strategy.recentNews[0].headline}
            </a>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center pt-3 border-t">
        <span className="text-xs text-muted-foreground">
          Strategy score: <strong>{strategy.strategyScore}</strong>
        </span>
        <Button size="sm" variant="outline" onClick={() => navigate(`/stock/${strategy.symbol}`)}>
          View Chart
        </Button>
      </div>
    </div>
  );
}
