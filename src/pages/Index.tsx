import { useState, useEffect, useRef } from 'react';
import { RiskLevel, MarketType, AIRecommendation, MomentumTier, ScreenerView } from '../types/stock';
import { StockCard } from '../components/StockCard';
import { RiskFilter } from '../components/RiskFilter';
import { CelebrityPanel } from '../components/CelebrityPanel';
import { StrategyCard } from '@/components/StrategyCard';
import { Button } from '@/components/ui/button';
import { ToggleRightIcon, RefreshCwIcon, StarIcon, ZapIcon, UsersIcon, LayoutGridIcon, BrainCircuitIcon, WalletIcon, RadioIcon, SparklesIcon, EyeIcon } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TradingPreferences } from '@/components/TradingPreferences';
import { CompoundingSimulator } from '@/components/CompoundingSimulator';
import { SelfAnalyzePanel } from '@/components/SelfAnalyzePanel';
import { PaperPortfolioPanel } from '@/components/PaperPortfolio';
import { MediaRadarPanel } from '@/components/MediaRadarPanel';
import { WatchlistPanel } from '@/components/WatchlistPanel';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const VIEW_TABS: { id: ScreenerView; label: string; icon: typeof StarIcon; description: string }[] = [
  {
    id: 'top-picks',
    label: 'Top Picks',
    icon: StarIcon,
    description: 'Best picks merged from momentum, celebrity overlap, Strategies & Media Radar',
  },
  {
    id: 'momentum',
    label: 'Momentum Leaders',
    icon: ZapIcon,
    description: 'Highest momentum scores across the market',
  },
  {
    id: 'celebrity',
    label: 'Celebrity Overlap',
    icon: UsersIcon,
    description: 'Stocks held by multiple top investors',
  },
  {
    id: 'strategies',
    label: 'Strategies',
    icon: BrainCircuitIcon,
    description: 'News-driven buy opportunities scored by chart algorithms',
  },
  {
    id: 'media-radar',
    label: 'Media Radar',
    icon: RadioIcon,
    description: 'Live TV & social mention scanner — catch stocks before momentum builds',
  },
  {
    id: 'watchlist',
    label: 'Watchlist',
    icon: EyeIcon,
    description: 'Recommended watchlist filtered by % change, volume, MACD, RSI & more',
  },
  {
    id: 'all',
    label: 'All Stocks',
    icon: LayoutGridIcon,
    description: 'Full screened universe ranked by composite score',
  },
];

const Index = () => {
  const [view, setView] = useState<ScreenerView>('top-picks');
  const [selectedRisk, setSelectedRisk] = useState<RiskLevel | 'all'>('all');
  const [selectedMarket, setSelectedMarket] = useState<MarketType | 'all'>('all');
  const [selectedRecommendation, setSelectedRecommendation] = useState<AIRecommendation | 'all'>('all');
  const [selectedMomentum, setSelectedMomentum] = useState<MomentumTier | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPreferences, setShowPreferences] = useState(false);
  const [showPaper, setShowPaper] = useState(false);
  const [showSelfAnalyze, setShowSelfAnalyze] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRadarRefreshing, setIsRadarRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const isSpecialView = view === 'strategies' || view === 'media-radar' || view === 'watchlist';

  const { data: stocks = [], isLoading: stocksLoading, error: stocksError } = useQuery({
    queryKey: ['marketData', view],
    queryFn: () => api.getMarketData(view),
    enabled: !isSpecialView,
    refetchInterval:
      view === 'top-picks' ? 60 * 1000 : 5 * 60 * 1000,
  });

  const {
    data: strategies = [],
    isLoading: strategiesLoading,
    error: strategiesError,
  } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => api.getStrategies(),
    enabled: view === 'strategies',
    staleTime: 30 * 60 * 1000,
  });

  const {
    data: mediaRadar,
    isLoading: radarLoading,
    error: radarError,
  } = useQuery({
    queryKey: ['mediaRadar'],
    queryFn: () => api.getMediaRadar(),
    enabled: view === 'media-radar',
    refetchInterval: view === 'media-radar' ? 30 * 1000 : false,
  });

  const isLoading =
    view === 'strategies'
      ? strategiesLoading
      : view === 'media-radar'
        ? radarLoading
        : view === 'watchlist'
          ? false
          : stocksLoading;
  const error =
    view === 'strategies'
      ? strategiesError
      : view === 'media-radar'
        ? radarError
        : view === 'watchlist'
          ? null
          : stocksError;

  const { data: celebrities = [] } = useQuery({
    queryKey: ['celebrities'],
    queryFn: () => api.getCelebrities(),
    staleTime: Infinity,
  });

  const { data: status } = useQuery({
    queryKey: ['screenerStatus'],
    queryFn: () => api.getScreenerStatus(),
    refetchInterval: (query) => (query.state.data?.isRefreshing ? 3000 : 10000),
  });

  const wasRefreshing = useRef(false);
  useEffect(() => {
    if (status?.isRefreshing) {
      wasRefreshing.current = true;
    } else if (wasRefreshing.current && status && !status.isRefreshing) {
      wasRefreshing.current = false;
      queryClient.invalidateQueries({ queryKey: ['marketData'] });
      toast.success('Live market data updated');
    }
  }, [status?.isRefreshing, status, queryClient]);

  const handleRadarRefresh = async () => {
    setIsRadarRefreshing(true);
    try {
      const data = await api.pollMediaRadar();
      queryClient.setQueryData(['mediaRadar'], data);
      toast.success(`Scan complete — ${data.status.earlyCount} pre-momentum hits`);
    } catch {
      toast.error('Media scan failed');
    } finally {
      setIsRadarRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await api.refreshScreener();
      await queryClient.invalidateQueries({ queryKey: ['marketData'] });
      await queryClient.invalidateQueries({ queryKey: ['screenerStatus'] });
      toast.success('Market data refreshed');
    } catch {
      toast.error('Failed to refresh market data');
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleAutoTrade = () => {
    setShowPreferences(!showPreferences);
    if (!showPreferences) {
      toast.info('Configure your trading preferences');
    }
  };

  const filteredStocks = stocks.filter((stock) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q || stock.symbol.toLowerCase().includes(q) || stock.name.toLowerCase().includes(q);
    const matchesRisk = selectedRisk === 'all' || stock.riskLevel === selectedRisk;
    const matchesMarket = selectedMarket === 'all' || stock.market === selectedMarket;
    const matchesRecommendation =
      selectedRecommendation === 'all' || stock.aiRecommendation === selectedRecommendation;
    const matchesMomentum =
      selectedMomentum === 'all' || stock.momentumTier === selectedMomentum;
    return matchesSearch && matchesRisk && matchesMarket && matchesRecommendation && matchesMomentum;
  });

  const activeTab = VIEW_TABS.find((t) => t.id === view)!;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-trading-background flex flex-col items-center justify-center gap-3">
        <RefreshCwIcon className="animate-spin text-trading-primary" size={32} />
        <div className="text-trading-primary font-medium">
          {view === 'strategies'
            ? 'Analyzing news & chart patterns...'
            : view === 'media-radar'
              ? 'Connecting to TV & social feeds...'
              : view === 'watchlist'
                ? 'Loading watchlist filters...'
                : 'Analyzing 300+ stocks...'}
        </div>
        <p className="text-sm text-trading-secondary">
          {view === 'strategies'
            ? 'Scanning web news and running strategy algorithms'
            : view === 'media-radar'
              ? 'Polling CNBC, Bloomberg, Reuters, Reddit, Stocktwits & breaking news'
              : 'Fetching live quotes & scoring momentum + celebrity overlap'}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-trading-background flex flex-col items-center justify-center gap-4">
        <div className="text-trading-danger">Error loading market data. Please try again.</div>
        <Button onClick={handleRefresh}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-trading-background">
      <div className="container py-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
          <div>
            <h1 className="text-4xl font-bold text-trading-primary mb-2">Invest Scout</h1>
            <p className="text-trading-secondary">
              Momentum screener with picks aligned to top celebrity portfolios
            </p>
            {status?.lastUpdated && (
              <p className="text-xs text-muted-foreground mt-1">
                {status.stockCount} stocks analyzed ·{' '}
                {status.isRefreshing
                  ? 'Fetching live quotes in background...'
                  : status.dataSource === 'finnhub'
                    ? 'Live data'
                    : 'Seed data — add FINNHUB_API_KEY to .env for live quotes'}{' '}
                · Updated {new Date(status.lastUpdated).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing || status?.isRefreshing}
              className="gap-2"
            >
              <RefreshCwIcon size={16} className={cn(isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => setShowSelfAnalyze(!showSelfAnalyze)} className="gap-2">
              <SparklesIcon size={18} />
              Self Analyze
            </Button>
            <Button variant="outline" onClick={() => setShowPaper(!showPaper)} className="gap-2">
              <WalletIcon size={18} />
              Paper Portfolio
            </Button>
            <Button variant="outline" onClick={toggleAutoTrade} className="gap-2">
              <ToggleRightIcon size={20} />
              AutoTrade
            </Button>
          </div>
        </div>

        {showSelfAnalyze && (
          <div className="mb-8 animate-slide-up">
            <SelfAnalyzePanel />
          </div>
        )}

        {showPaper && (
          <div className="mb-8 animate-slide-up">
            <PaperPortfolioPanel />
          </div>
        )}

        {showPreferences && (
          <div className="mb-8 animate-slide-up space-y-6">
            <TradingPreferences />
            <CompoundingSimulator />
          </div>
        )}

        <CelebrityPanel celebrities={celebrities} />

        <div className="flex flex-wrap gap-2 mb-4">
          {VIEW_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.id}
                variant={view === tab.id ? 'default' : 'outline'}
                onClick={() => setView(tab.id)}
                className="gap-2"
              >
                <Icon size={16} />
                {tab.label}
              </Button>
            );
          })}
        </div>

        <p className="text-sm text-trading-secondary mb-6">{activeTab.description}</p>

        {view !== 'strategies' && view !== 'media-radar' && view !== 'watchlist' && (
          <div className="mb-8">
            <RiskFilter
            selectedRisk={selectedRisk}
            selectedMarket={selectedMarket}
            selectedRecommendation={selectedRecommendation}
            selectedMomentum={selectedMomentum}
            searchQuery={searchQuery}
            onRiskChange={setSelectedRisk}
            onMarketChange={setSelectedMarket}
            onRecommendationChange={setSelectedRecommendation}
            onMomentumChange={setSelectedMomentum}
            onSearchChange={setSearchQuery}
          />
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {view === 'watchlist' ? (
            <div className="col-span-full">
              <WatchlistPanel />
            </div>
          ) : view === 'media-radar' && mediaRadar ? (
            <div className="col-span-full">
              <MediaRadarPanel
                data={mediaRadar}
                onRefresh={handleRadarRefresh}
                isRefreshing={isRadarRefreshing}
              />
            </div>
          ) : view === 'strategies' ? (
            strategies.length === 0 ? (
              <div className="col-span-full text-center text-trading-secondary py-8">
                No strategy opportunities found. Try refreshing.
              </div>
            ) : (
              strategies.map((s) => <StrategyCard key={s.symbol} strategy={s} />)
            )
          ) : filteredStocks.length === 0 ? (
            <div className="col-span-full text-center text-trading-secondary py-8">
              No stocks found matching the selected filters
            </div>
          ) : (
            filteredStocks.map((stock) => <StockCard key={stock.symbol} stock={stock} />)
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
