import { RiskLevel, MarketType, AIRecommendation, MomentumTier } from '../types/stock';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface RiskFilterProps {
  selectedRisk: RiskLevel | 'all';
  selectedMarket: MarketType | 'all';
  selectedRecommendation: AIRecommendation | 'all';
  selectedMomentum: MomentumTier | 'all';
  searchQuery: string;
  onRiskChange: (risk: RiskLevel | 'all') => void;
  onMarketChange: (market: MarketType | 'all') => void;
  onRecommendationChange: (rec: AIRecommendation | 'all') => void;
  onMomentumChange: (tier: MomentumTier | 'all') => void;
  onSearchChange: (query: string) => void;
}

export const RiskFilter = ({
  selectedRisk,
  selectedMarket,
  selectedRecommendation,
  selectedMomentum,
  searchQuery,
  onRiskChange,
  onMarketChange,
  onRecommendationChange,
  onMomentumChange,
  onSearchChange,
}: RiskFilterProps) => {
  return (
    <div className="space-y-4">
      <Input
        placeholder="Search by symbol or company name..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-md"
      />

      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedRisk === 'all' ? 'default' : 'outline'}
          onClick={() => onRiskChange('all')}
        >
          All Risks
        </Button>
        <Button
          variant={selectedRisk === 'low' ? 'default' : 'outline'}
          onClick={() => onRiskChange('low')}
          className="border-green-200 hover:bg-green-50"
        >
          Low Risk
        </Button>
        <Button
          variant={selectedRisk === 'medium' ? 'default' : 'outline'}
          onClick={() => onRiskChange('medium')}
          className="border-yellow-200 hover:bg-yellow-50"
        >
          Medium Risk
        </Button>
        <Button
          variant={selectedRisk === 'high' ? 'default' : 'outline'}
          onClick={() => onRiskChange('high')}
          className="border-red-200 hover:bg-red-50"
        >
          High Risk
        </Button>
      </div>

      <div className="flex flex-wrap gap-4">
        <Select value={selectedMarket} onValueChange={(value: MarketType | 'all') => onMarketChange(value)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select Market" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Markets</SelectItem>
            <SelectItem value="NASDAQ">NASDAQ</SelectItem>
            <SelectItem value="NYSE">NYSE</SelectItem>
            <SelectItem value="OTHER">Other Markets</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={selectedRecommendation}
          onValueChange={(value: AIRecommendation | 'all') => onRecommendationChange(value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="AI Recommendation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Recommendations</SelectItem>
            <SelectItem value="buy">Buy</SelectItem>
            <SelectItem value="sell">Sell</SelectItem>
            <SelectItem value="hold">Hold</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={selectedMomentum}
          onValueChange={(value: MomentumTier | 'all') => onMomentumChange(value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Momentum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Momentum</SelectItem>
            <SelectItem value="strong">Strong</SelectItem>
            <SelectItem value="building">Building</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="weak">Weak</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
