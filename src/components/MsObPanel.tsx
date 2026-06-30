import { Badge } from '@/components/ui/badge';
import { MarketStructureAnalysis } from '@/types/msb';
import { cn } from '@/lib/utils';

interface MsObPanelProps {
  msb: MarketStructureAnalysis;
}

export function MsObPanel({ msb }: MsObPanelProps) {
  const recColors = {
    buy: 'bg-green-100 text-green-800 border-green-200',
    watch: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    avoid: 'bg-red-100 text-red-800 border-red-200',
  };

  const trendColors = {
    bullish: 'text-green-600',
    bearish: 'text-red-600',
    neutral: 'text-muted-foreground',
  };

  return (
    <div className="bg-white rounded-lg border p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold">Market Structure Break (MSB-OB)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{msb.attribution}</p>
        </div>
        <Badge className={cn('border', recColors[msb.recommendation])}>
          {msb.recommendation.toUpperCase()}
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">MSB Score</p>
          <p className="font-bold text-lg">{msb.msbScore}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Structure</p>
          <p className={cn('font-semibold capitalize', trendColors[msb.market])}>{msb.market}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Active zones</p>
          <p className="font-semibold">{msb.activeZones.length}</p>
        </div>
      </div>

      <ul className="space-y-1 mb-4">
        {msb.signals.map((s) => (
          <li key={s} className="text-sm flex items-start gap-2">
            <span className="text-emerald-600">•</span>
            {s}
          </li>
        ))}
      </ul>

      {msb.activeZones.length > 0 && (
        <div className="border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Order / breaker blocks</p>
          <div className="flex flex-wrap gap-1.5">
            {msb.activeZones.map((z, i) => (
              <Badge
                key={`${z.type}-${i}`}
                variant="outline"
                className={cn(
                  'text-xs font-mono',
                  z.bias === 'bullish' ? 'border-green-300 text-green-700' : 'border-red-300 text-red-700'
                )}
              >
                {z.type} ${z.low.toFixed(2)}–${z.high.toFixed(2)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-3">
        Zigzag pivots → MSB label on chart → Bu-OB / Be-OB zones (green/red bands). Complements SMC
        structure analysis.
      </p>
    </div>
  );
}
