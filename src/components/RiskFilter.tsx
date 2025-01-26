import { RiskLevel } from '../types/stock';
import { Button } from '@/components/ui/button';

interface RiskFilterProps {
  selectedRisk: RiskLevel | 'all';
  onRiskChange: (risk: RiskLevel | 'all') => void;
}

export const RiskFilter = ({ selectedRisk, onRiskChange }: RiskFilterProps) => {
  return (
    <div className="flex gap-2 mb-6">
      <Button
        variant={selectedRisk === 'all' ? 'default' : 'outline'}
        onClick={() => onRiskChange('all')}
      >
        All
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
  );
};