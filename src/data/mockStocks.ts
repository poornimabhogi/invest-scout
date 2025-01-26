import { Stock } from '../types/stock';

export const mockStocks: Stock[] = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    price: 173.50,
    change: 2.30,
    changePercentage: 1.34,
    riskLevel: 'low',
    marketCap: 2800000000000,
    volume: 55000000,
    market: 'NASDAQ',
    sector: 'Technology',
    aiRecommendation: 'buy',
    aiConfidenceScore: 0.85
  },
  {
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    price: 238.45,
    change: -5.20,
    changePercentage: -2.14,
    riskLevel: 'high',
    marketCap: 750000000000,
    volume: 125000000,
    market: 'NASDAQ',
    sector: 'Automotive',
    aiRecommendation: 'hold',
    aiConfidenceScore: 0.65
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    price: 338.11,
    change: 4.15,
    changePercentage: 1.24,
    riskLevel: 'low',
    marketCap: 2500000000000,
    volume: 22000000,
    market: 'NASDAQ',
    sector: 'Technology',
    aiRecommendation: 'buy',
    aiConfidenceScore: 0.92
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    price: 445.20,
    change: 12.30,
    changePercentage: 2.84,
    riskLevel: 'medium',
    marketCap: 1100000000000,
    volume: 35000000,
    market: 'NASDAQ',
    sector: 'Technology',
    aiRecommendation: 'buy',
    aiConfidenceScore: 0.88
  },
  {
    symbol: 'AMD',
    name: 'Advanced Micro Devices',
    price: 108.75,
    change: -2.25,
    changePercentage: -2.03,
    riskLevel: 'medium',
    marketCap: 175000000000,
    volume: 42000000,
    market: 'NASDAQ',
    sector: 'Technology',
    aiRecommendation: 'sell',
    aiConfidenceScore: 0.78
  },
];