import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  CrosshairMode,
  UTCTimestamp,
  SeriesMarker,
  IPriceLine,
  createSeriesMarkers,
} from 'lightweight-charts';
import { Candle } from '@/types/chart';
import { SmartMoneyAnalysis } from '@/types/smc';
import { MarketStructureAnalysis } from '@/types/msb';
import { UtBotAnalysis } from '@/types/utBot';
import { OptimalTradeEntryAnalysis } from '@/types/ote';

interface ChartOverlay {
  markers: SmartMoneyAnalysis['overlay']['markers'];
  priceLines: SmartMoneyAnalysis['overlay']['priceLines'];
}

interface CandlestickChartProps {
  candles: Candle[];
  height?: number;
  showVolume?: boolean;
  smc?: SmartMoneyAnalysis | null;
  msb?: MarketStructureAnalysis | null;
  utBot?: UtBotAnalysis | null;
  ote?: OptimalTradeEntryAnalysis | null;
}

function mergeOverlays(
  smc?: SmartMoneyAnalysis | null,
  msb?: MarketStructureAnalysis | null,
  utBot?: UtBotAnalysis | null,
  ote?: OptimalTradeEntryAnalysis | null
): ChartOverlay | null {
  const markers = [
    ...(smc?.overlay.markers ?? []),
    ...(msb?.overlay.markers ?? []),
    ...(utBot?.overlay.markers ?? []),
    ...(ote?.overlay.markers ?? []),
  ];
  const priceLines = [
    ...(smc?.overlay.priceLines ?? []),
    ...(msb?.overlay.priceLines ?? []),
    ...(ote?.overlay.priceLines ?? []),
    ...(utBot?.overlay.priceLines ?? []),
  ];
  if (!markers.length && !priceLines.length) return null;
  return { markers, priceLines };
}

export function CandlestickChart({
  candles,
  height = 400,
  showVolume = true,
  smc,
  msb,
  utBot,
  ote,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlay = mergeOverlays(smc, msb, utBot, ote);

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

    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    const priceLines: IPriceLine[] = [];
    let markersPlugin: ReturnType<typeof createSeriesMarkers> | null = null;
    if (overlay) {
      const candleTimes = new Set(candles.map((c) => c.time));
      const markers: SeriesMarker<UTCTimestamp>[] = overlay.markers
        .filter((m) => candleTimes.has(m.time))
        .map((m) => ({
          time: m.time as UTCTimestamp,
          position: m.position,
          color: m.color,
          shape: m.shape,
          text: m.text,
        }));
      if (markers.length) {
        markersPlugin = createSeriesMarkers(candleSeries, markers);
      }

      for (const line of overlay.priceLines) {
        priceLines.push(
          candleSeries.createPriceLine({
            price: line.price,
            color: line.color,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: !!line.title,
            title: line.title,
          })
        );
      }
    }

    if (showVolume) {
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#94a3b8',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
      volumeSeries.setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp,
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
      markersPlugin?.detach?.();
      for (const pl of priceLines) {
        candleSeries.removePriceLine(pl);
      }
      observer.disconnect();
      chart.remove();
    };
  }, [candles, height, showVolume, smc, msb, utBot, ote]);

  if (!candles.length) {
    return (
      <div className="flex items-center justify-center bg-slate-50 rounded-lg" style={{ height }}>
        <span className="text-sm text-muted-foreground">No chart data available</span>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full rounded-lg overflow-hidden border" />;
}
