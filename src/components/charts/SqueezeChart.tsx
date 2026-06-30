import { useEffect, useRef } from 'react';
import { createChart, ColorType, HistogramSeries, LineSeries, CrosshairMode, UTCTimestamp } from 'lightweight-charts';
import { Candle } from '@/types/chart';
import { computeSqueezeMomentum } from '@/lib/chartIndicators';

interface SqueezeChartProps {
  candles: Candle[];
  height?: number;
}

export function SqueezeChart({ candles, height = 120 }: SqueezeChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length < 30) return;

    const sqz = computeSqueezeMomentum(candles);
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

    const zeroSeries = chart.addSeries(LineSeries, {
      color: '#94a3b8',
      lineWidth: 1,
      lineStyle: 2,
      priceFormat: { type: 'price', precision: 3, minMove: 0.001 },
    });

    const histPoints: { time: UTCTimestamp; value: number; color: string }[] = [];
    const zeroPoints: { time: UTCTimestamp; value: number; color?: string }[] = [];

    candles.forEach((c, i) => {
      const point = sqz.series[i];
      const time = c.time as UTCTimestamp;
      if (point?.value != null) {
        histPoints.push({
          time,
          value: point.value,
          color: point.barColor + 'cc',
        });
      }
      zeroPoints.push({ time, value: 0 });
    });

    histSeries.setData(histPoints);
    zeroSeries.setData(zeroPoints);

    const last = sqz.series.at(-1);
    if (last) {
      zeroSeries.applyOptions({
        color: last.squeezeOn ? '#000000' : last.squeezeOff ? '#808080' : '#2563eb',
        lineWidth: 2,
      });
    }

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

  if (candles.length < 30) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50 rounded-lg border text-sm text-muted-foreground"
        style={{ height }}
      >
        Not enough data for Squeeze Momentum (need 30+ candles)
      </div>
    );
  }

  return <div ref={containerRef} className="w-full rounded-lg overflow-hidden border" />;
}
