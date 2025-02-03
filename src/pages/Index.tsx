import { useState } from 'react';
import { RiskLevel, MarketType, AIRecommendation, Stock } from '../types/stock';
import { StockCard } from '../components/StockCard';
import { RiskFilter } from '../components/RiskFilter';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { LogOutIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { toast } from "sonner";
import { TradingPreferences } from '@/components/TradingPreferences';

const fetchMarketData = async () => {
  console.log('Fetching market data...');
  const { data, error } = await supabase
    .from('market_data')
    .select('*');

  if (error) {
    console.error('Error fetching market data:', error);
    toast.error('Failed to fetch market data');
    throw error;
  }

  console.log('Raw market data:', data);

  if (!data || data.length === 0) {
    console.log('No market data found');
    return [];
  }

  // Transform the data to match our Stock type
  const transformedData = data.map((item): Stock => ({
    symbol: item.symbol,
    name: item.name || item.symbol,
    price: Number(item.price) || 0,
    change: Number(item.change) || 0,
    changePercentage: Number(item.change_percentage) || 0,
    marketCap: Number(item.market_cap) || 0,
    volume: Number(item.volume) || 0,
    market: (item.market as MarketType) || 'OTHER',
    sector: item.sector || 'Technology',
    riskLevel: calculateRiskLevel(Number(item.change_percentage)),
    aiRecommendation: calculateRecommendation(Number(item.change_percentage)),
    aiConfidenceScore: 0.85
  }));

  console.log('Final transformed data:', transformedData);
  return transformedData;
};

const calculateRiskLevel = (changePercentage: number): RiskLevel => {
  if (Math.abs(changePercentage) < 2) return 'low';
  if (Math.abs(changePercentage) < 5) return 'medium';
  return 'high';
};

const calculateRecommendation = (changePercentage: number): AIRecommendation => {
  if (changePercentage > 2) return 'buy';
  if (changePercentage < -2) return 'sell';
  return 'hold';
};

const Index = () => {
  const [selectedRisk, setSelectedRisk] = useState<RiskLevel | 'all'>('all');
  const [selectedMarket, setSelectedMarket] = useState<MarketType | 'all'>('all');
  const [selectedRecommendation, setSelectedRecommendation] = useState<AIRecommendation | 'all'>('all');

  const { data: stocks = [], isLoading, error } = useQuery({
    queryKey: ['marketData'],
    queryFn: fetchMarketData,
    refetchInterval: 60000, // Refetch every minute to keep data fresh
  });

  console.log('Current stocks:', stocks);
  console.log('Loading state:', isLoading);
  console.log('Error state:', error);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const filteredStocks = stocks.filter(stock => {
    const matchesRisk = selectedRisk === 'all' || stock.riskLevel === selectedRisk;
    const matchesMarket = selectedMarket === 'all' || stock.market === selectedMarket;
    const matchesRecommendation = selectedRecommendation === 'all' || stock.aiRecommendation === selectedRecommendation;
    return matchesRisk && matchesMarket && matchesRecommendation;
  });

  console.log('Filtered stocks:', filteredStocks);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-trading-background flex items-center justify-center">
        <div className="text-trading-primary">Loading market data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-trading-background flex items-center justify-center">
        <div className="text-trading-danger">Error loading market data. Please try again later.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-trading-background">
      <div className="container py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-trading-primary mb-2">Stock Trading Assistant</h1>
            <p className="text-trading-secondary">Make informed trading decisions with risk management</p>
          </div>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="gap-2"
          >
            <LogOutIcon size={16} />
            Sign Out
          </Button>
        </div>

        <div className="mb-8">
          <TradingPreferences />
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
          {filteredStocks.length === 0 ? (
            <div className="col-span-full text-center text-trading-secondary py-8">
              No stocks found matching the selected filters
            </div>
          ) : (
            filteredStocks.map((stock) => (
              <StockCard key={stock.symbol} stock={stock} />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
