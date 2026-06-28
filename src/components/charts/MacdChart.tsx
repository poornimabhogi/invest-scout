import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineSeries, HistogramSeries, CrosshairMode } from 'lightweight-charts';
import { Candle } from '@/types/chart';
import { computeMACD } from '@/lib/chartIndicators';

interface MacdChartProps {
  candles: Candle[];
  height?: number;
}

export function MacdChart({ candles, height = 140 }: MacdChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length < 35) return;

    const macdData = computeMACD(candles);
    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#64748b',
      },
      grid: {
        vertLines: { color: '#f1f5f9' },
        horzLines: { color: '#f1f5f9' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#e2e8f0' },
      timeScale: { borderColor: '#e2e8f0', timeVisible: false },
    });

    const histSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'price', precision: 3, minMove: 0.001 },
    });
    const macdSeries = chart.addSeries(LineSeries, {
      color: '#2563eb',
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 3, minMove: 0.001 },
    });
    const signalSeries = chart.addSeries(LineSeries, {
      color: '#f97316',
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 3, minMove: 0.001 },
    });

    const macdPoints: { time: import('lightweight-charts').UTCTimestamp; value: number }[] = [];
    const signalPoints: { time: import('lightweight-charts').UTCTimestamp; value: number }[] = [];
    const histPoints: {
      time: import('lightweight-charts').UTCTimestamp;
      value: number;
      color: string;
    }[] = [];

    candles.forEach((c, i) => {
      const point = macdData.series[i];
      const time = c.time as unknown as import('lightweight-charts').UTCTimestamp;
      if (point?.macd != null) macdPoints.push({ time, value: point.macd });
      if (point?.signal != null) signalPoints.push({ time, value: point.signal });
      if (point?.histogram != null) {
        histPoints.push({
          time,
          value: point.histogram,
          color: point.histogram >= 0 ? '#22c55e99' : '#ef444499',
        });
      }
    });

    histSeries.setData(histPoints);
    macdSeries.setData(macdPoints);
    signalSeries.setData(signalPoints);
    chart.timeScale().fitContent();

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) chart.applyOptions({ width: entries[0].contentRect.width });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [candles, height]);

  if (candles.length < 35) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50 rounded-lg border text-sm text-muted-foreground"
        style={{ height }}
      >
        Not enough data for MACD (need 35+ candles)
      </div>
    );
  }

  return <div ref={containerRef} className="w-full rounded-lg overflow-hidden border" />;
}
