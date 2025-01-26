import { Stock } from '../types/stock';
import { cn } from '@/lib/utils';
import { ArrowUpIcon, ArrowDownIcon } from 'lucide-react';

interface StockCardProps {
  stock: Stock;
}

const formatNumber = (num: number): string => {
  if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  return num.toLocaleString();
};

export const StockCard = ({ stock }: StockCardProps) => {
  const isPositive = stock.change >= 0;

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow animate-slide-up">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-trading-primary">{stock.symbol}</h3>
          <p className="text-sm text-trading-secondary">{stock.name}</p>
        </div>
        <div className={cn(
          "px-2 py-1 rounded text-xs font-semibold",
          {
            'bg-green-100 text-trading-success': stock.riskLevel === 'low',
            'bg-yellow-100 text-yellow-700': stock.riskLevel === 'medium',
            'bg-red-100 text-trading-danger': stock.riskLevel === 'high',
          }
        )}>
          {stock.riskLevel.toUpperCase()} RISK
        </div>
      </div>
      
      <div className="flex justify-between items-center">
        <span className="text-2xl font-bold">${stock.price.toFixed(2)}</span>
        <div className={cn(
          "flex items-center space-x-1",
          isPositive ? "text-trading-success" : "text-trading-danger"
        )}>
          {isPositive ? <ArrowUpIcon size={16} /> : <ArrowDownIcon size={16} />}
          <span className="font-semibold">
            {isPositive ? '+' : ''}{stock.change.toFixed(2)} ({stock.changePercentage.toFixed(2)}%)
          </span>
        </div>
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
    </div>
  );
};