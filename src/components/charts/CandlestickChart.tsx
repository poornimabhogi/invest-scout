import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  CrosshairMode,
} from 'lightweight-charts';
import { Candle } from '@/types/chart';

interface CandlestickChartProps {
  candles: Candle[];
  height?: number;
  showVolume?: boolean;
}

export function CandlestickChart({ candles, height = 400, showVolume = true }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !candles.length) return;

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#334155',
      },
      grid: {
        vertLines: { color: '#f1f5f9' },
        horzLines: { color: '#f1f5f9' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#e2e8f0' },
      timeScale: { borderColor: '#e2e8f0', timeVisible: true },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#16a34a',
      downColor: '#dc2626',
      borderUpColor: '#16a34a',
      borderDownColor: '#dc2626',
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
    });

    const chartData = candles.map((c) => ({
      time: c.time as unknown as import('lightweight-charts').UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeries.setData(chartData);

    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#94a3b8',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
      volumeSeries.setData(
        candles.map((c) => ({
          time: c.time as unknown as import('lightweight-charts').UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? '#86efac88' : '#fca5a588',
        }))
      );
    }

    chart.timeScale().fitContent();

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        chart.applyOptions({ width: entries[0].contentRect.width });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [candles, height, showVolume]);

  if (!candles.length) {
    return (
      <div className="flex items-center justify-center bg-slate-50 rounded-lg" style={{ height }}>
        <span className="text-sm text-muted-foreground">No chart data available</span>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full rounded-lg overflow-hidden border" />;
}
