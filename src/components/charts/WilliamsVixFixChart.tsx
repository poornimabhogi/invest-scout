import { useEffect, useRef } from 'react';
import { createChart, ColorType, HistogramSeries, LineSeries, CrosshairMode, UTCTimestamp } from 'lightweight-charts';
import { Candle } from '@/types/chart';
import { computeWilliamsVixFix } from '@/lib/chartIndicators';

interface WilliamsVixFixChartProps {
  candles: Candle[];
  height?: number;
}

export function WilliamsVixFixChart({ candles, height = 120 }: WilliamsVixFixChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length < 55) return;

    const wvf = computeWilliamsVixFix(candles);
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
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });

    const upperSeries = chart.addSeries(LineSeries, {
      color: '#22d3ee',
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });

    const rangeHighSeries = chart.addSeries(LineSeries, {
      color: '#f97316',
      lineWidth: 2,
      lineStyle: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });

    const histPoints: { time: UTCTimestamp; value: number; color: string }[] = [];
    const upperPoints: { time: UTCTimestamp; value: number }[] = [];
    const rangeHighPoints: { time: UTCTimestamp; value: number }[] = [];

    candles.forEach((c, i) => {
      const point = wvf.series[i];
      const time = c.time as UTCTimestamp;
      if (point?.value != null) {
        histPoints.push({
          time,
          value: point.value,
          color: point.extreme ? '#84cc16cc' : '#9ca3afaa',
        });
      }
      if (point?.upperBand != null) {
        upperPoints.push({ time, value: point.upperBand });
      }
      if (point?.rangeHigh != null) {
        rangeHighPoints.push({ time, value: point.rangeHigh });
      }
    });

    histSeries.setData(histPoints);
    upperSeries.setData(upperPoints);
    rangeHighSeries.setData(rangeHighPoints);
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

  if (candles.length < 55) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50 rounded-lg border text-sm text-muted-foreground"
        style={{ height }}
      >
        Not enough data for Williams Vix Fix (need 55+ candles)
      </div>
    );
  }

  return <div ref={containerRef} className="w-full rounded-lg overflow-hidden border" />;
}
