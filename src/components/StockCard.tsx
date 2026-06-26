import { Stock, MomentumTier } from '../types/stock';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { MiniChart } from '@/components/charts/MiniChart';
import {
  ArrowUpIcon,
  ArrowDownIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  MinusIcon,
  StarIcon,
  UsersIcon,
  ZapIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface StockCardProps {
  stock: Stock;
}

const formatNumber = (num: number): string => {
  if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  return num.toLocaleString();
};

const momentumTierLabel: Record<MomentumTier, string> = {
  strong: 'Strong Momentum',
  building: 'Building',
  neutral: 'Neutral',
  weak: 'Weak',
};

const momentumTierColor: Record<MomentumTier, string> = {
  strong: 'bg-emerald-100 text-emerald-800',
  building: 'bg-sky-100 text-sky-800',
  neutral: 'bg-gray-100 text-gray-700',
  weak: 'bg-orange-100 text-orange-800',
};

export const StockCard = ({ stock }: StockCardProps) => {
  const navigate = useNavigate();
  const isPositive = stock.change >= 0;

  const getRecommendationIcon = (recommendation: Stock['aiRecommendation']) => {
    switch (recommendation) {
      case 'buy':
        return <TrendingUpIcon className="text-green-500" size={16} />;
      case 'sell':
        return <TrendingDownIcon className="text-red-500" size={16} />;
      case 'hold':
        return <MinusIcon className="text-yellow-500" size={16} />;
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/stock/${stock.symbol}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/stock/${stock.symbol}`)}
      className={cn(
        'bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow animate-slide-up cursor-pointer',
        stock.isTopPick && 'ring-2 ring-amber-400 ring-offset-1'
      )}
    >
      {stock.isTopPick && (
        <div className="flex items-center gap-1 text-amber-600 text-xs font-semibold mb-3">
          <StarIcon size={14} className="fill-amber-400 text-amber-400" />
          Top Pick — Momentum + Celebrity Overlap
        </div>
      )}

      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xl font-bold text-trading-primary">{stock.symbol}</h3>
            <span
              className={cn('text-xs font-medium px-2 py-1 rounded', {
                'bg-blue-100 text-blue-700': stock.market === 'NASDAQ',
                'bg-purple-100 text-purple-700': stock.market === 'NYSE',
                'bg-gray-100 text-gray-700': stock.market === 'OTHER',
              })}
            >
              {stock.market}
            </span>
            <span className={cn('text-xs font-medium px-2 py-1 rounded', momentumTierColor[stock.momentumTier])}>
              {momentumTierLabel[stock.momentumTier]}
            </span>
          </div>
          <p className="text-sm text-trading-secondary">{stock.name}</p>
          <p className="text-xs text-trading-secondary mt-1">{stock.sector}</p>
        </div>
        <div
          className={cn('px-2 py-1 rounded text-xs font-semibold', {
            'bg-green-100 text-trading-success': stock.riskLevel === 'low',
            'bg-yellow-100 text-yellow-700': stock.riskLevel === 'medium',
            'bg-red-100 text-trading-danger': stock.riskLevel === 'high',
          })}
        >
          {stock.riskLevel.toUpperCase()} RISK
        </div>
      </div>

      <div className="flex justify-between items-center">
        <span className="text-2xl font-bold">${stock.price.toFixed(2)}</span>
        <div
          className={cn(
            'flex items-center space-x-1',
            isPositive ? 'text-trading-success' : 'text-trading-danger'
          )}
        >
          {isPositive ? <ArrowUpIcon size={16} /> : <ArrowDownIcon size={16} />}
          <span className="font-semibold">
            {isPositive ? '+' : ''}
            {stock.change.toFixed(2)} ({stock.changePercentage.toFixed(2)}%)
          </span>
        </div>
      </div>

      <div className="mt-3 mb-1">
        <MiniChart symbol={stock.symbol} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm text-trading-secondary">
        <div>
          <p className="font-medium">Market Cap</p>
          <p className="text-trading-primary">${formatNumber(stock.marketCap)}</p>
        </div>
        <div>
          <p className="font-medium">Volume</p>
          <p className="text-trading-primary">{formatNumber(stock.volume)}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="flex items-center gap-1.5 bg-slate-50 rounded px-2 py-1.5">
          <ZapIcon size={12} className="text-sky-600" />
          <span>Momentum: <strong>{stock.momentumScore}</strong></span>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-50 rounded px-2 py-1.5">
          <UsersIcon size={12} className="text-violet-600" />
          <span>Celebrities: <strong>{stock.celebrityScore}</strong></span>
        </div>
      </div>

      {stock.celebrityHolders.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {stock.celebrityHolders.slice(0, 4).map((holder) => (
            <Badge key={holder.id} variant="secondary" className="text-xs">
              {holder.name.split(' ').slice(-1)[0]}
            </Badge>
          ))}
          {stock.celebrityHolders.length > 4 && (
            <Badge variant="outline" className="text-xs">
              +{stock.celebrityHolders.length - 4} more
            </Badge>
          )}
        </div>
      )}

      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getRecommendationIcon(stock.aiRecommendation)}
            <span className="text-sm font-medium capitalize">
              AI Recommends: {stock.aiRecommendation}
            </span>
          </div>
          <span className="text-xs font-medium text-trading-secondary">
            Score: {stock.compositeScore} · {(stock.aiConfidenceScore * 100).toFixed(0)}% conf
          </span>
        </div>
      </div>
    </div>
  );
};
