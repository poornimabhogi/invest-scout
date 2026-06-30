import { Badge } from '@/components/ui/badge';
import { OptimalTradeEntryAnalysis } from '@/types/ote';
import { cn } from '@/lib/utils';

interface OtePanelProps {
  ote: OptimalTradeEntryAnalysis;
}

export function OtePanel({ ote }: OtePanelProps) {
  const recColors = {
    buy: 'bg-green-100 text-green-800 border-green-200',
    watch: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    avoid: 'bg-red-100 text-red-800 border-red-200',
  };

  return (
    <div className="bg-white rounded-lg border p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold">Automatic OTE</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{ote.attribution}</p>
        </div>
        <Badge className={cn('border', recColors[ote.recommendation])}>
          {ote.recommendation.toUpperCase()}
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">OTE Score</p>
          <p className="font-bold text-lg">{ote.oteScore}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Leg bias</p>
          <p className={cn('font-semibold capitalize', ote.bias === 'bullish' ? 'text-green-600' : ote.bias === 'bearish' ? 'text-red-600' : '')}>
            {ote.bias}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">In OTE zone</p>
          <p className="font-semibold">{ote.inOteZone ? 'Yes ✓' : ote.nearOteZone ? 'Near' : 'No'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Fib band</p>
          <p className="font-semibold text-xs">62% – 79%</p>
        </div>
      </div>

      {ote.zone && (
        <div className="rounded-lg bg-violet-50 border border-violet-100 p-3 mb-4 text-xs font-mono space-y-1">
          <p>
            OTE ${Math.min(ote.zone.oteTop, ote.zone.oteBottom).toFixed(2)} – $
            {Math.max(ote.zone.oteTop, ote.zone.oteBottom).toFixed(2)}
          </p>
          <p className="text-muted-foreground">
            Swing ${ote.zone.swingLow.toFixed(2)} → ${ote.zone.swingHigh.toFixed(2)} · EQ $
            {ote.zone.equilibrium.toFixed(2)} · Now ${ote.zone.currentPrice.toFixed(2)}
          </p>
        </div>
      )}

      <ul className="space-y-1 mb-3">
        {ote.signals.map((s) => (
          <li key={s} className="text-sm flex items-start gap-2">
            <span className="text-violet-600">•</span>
            {s}
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        Optimal entry after an impulse leg — price pulling back into the 62–79% Fib zone. Best with SMC +
        MSB dual structure.
      </p>
    </div>
  );
}
