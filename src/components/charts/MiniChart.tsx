import { useEffect, useRef } from 'react';
import { createChart, ColorType, AreaSeries } from 'lightweight-charts';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface MiniChartProps {
  symbol: string;
}

export function MiniChart({ symbol }: MiniChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['miniChart', symbol],
    queryFn: () => api.getCandles(symbol, '1M'),
    staleTime: 15 * 60 * 1000,
  });

  const candles = data?.candles ?? [];
  const isPositive =
    candles.length >= 2 ? candles[candles.length - 1].close >= candles[0].close : true;

  useEffect(() => {
    if (!containerRef.current || candles.length < 2) return;

    const chart = createChart(containerRef.current, {
      height: 80,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'transparent',
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: isPositive ? '#16a34a' : '#dc2626',
      topColor: isPositive ? '#16a34a33' : '#dc262633',
      bottomColor: isPositive ? '#16a34a00' : '#dc262600',
      lineWidth: 2,
    });

    series.setData(
      candles.map((c) => ({
        time: c.time as unknown as import('lightweight-charts').UTCTimestamp,
        value: c.close,
      }))
    );

    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [candles, isPositive]);

  if (!candles.length) {
    return <div className="h-20 bg-slate-50 rounded animate-pulse" />;
  }

  return <div ref={containerRef} className="w-full h-20" />;
}
