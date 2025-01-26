import { useState } from 'react';
import { mockStocks } from '../data/mockStocks';
import { RiskLevel, MarketType, AIRecommendation } from '../types/stock';
import { StockCard } from '../components/StockCard';
import { RiskFilter } from '../components/RiskFilter';

const Index = () => {
  const [selectedRisk, setSelectedRisk] = useState<RiskLevel | 'all'>('all');
  const [selectedMarket, setSelectedMarket] = useState<MarketType | 'all'>('all');
  const [selectedRecommendation, setSelectedRecommendation] = useState<AIRecommendation | 'all'>('all');

  const filteredStocks = mockStocks.filter(stock => {
    const matchesRisk = selectedRisk === 'all' || stock.riskLevel === selectedRisk;
    const matchesMarket = selectedMarket === 'all' || stock.market === selectedMarket;
    const matchesRecommendation = selectedRecommendation === 'all' || stock.aiRecommendation === selectedRecommendation;
    return matchesRisk && matchesMarket && matchesRecommendation;
  });

  return (
    <div className="min-h-screen bg-trading-background">
      <div className="container py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-trading-primary mb-2">Stock Trading</h1>
          <p className="text-trading-secondary">Discover and analyze stocks with AI-powered insights</p>
        </div>

        <RiskFilter 
          selectedRisk={selectedRisk} 
          selectedMarket={selectedMarket}
          selectedRecommendation={selectedRecommendation}
          onRiskChange={setSelectedRisk}
          onMarketChange={setSelectedMarket}
          onRecommendationChange={setSelectedRecommendation}
        />

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStocks.map((stock) => (
            <StockCard key={stock.symbol} stock={stock} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Index;