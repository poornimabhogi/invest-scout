import { Badge } from '@/components/ui/badge';
import { SmartMoneyAnalysis } from '@/types/smc';
import { cn } from '@/lib/utils';

interface SmcPanelProps {
  smc: SmartMoneyAnalysis;
}

export function SmcPanel({ smc }: SmcPanelProps) {
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

  const zoneLabels = {
    premium: 'Premium (sell-side)',
    equilibrium: 'Equilibrium',
    discount: 'Discount (buy-side)',
  };

  return (
    <div className="bg-white rounded-lg border p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold">Smart Money Concepts</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{smc.attribution}</p>
        </div>
        <Badge className={cn('border', recColors[smc.recommendation])}>
          {smc.recommendation.toUpperCase()}
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">SMC Score</p>
          <p className="font-bold text-lg">{smc.smcScore}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Swing Trend</p>
          <p className={cn('font-semibold capitalize', trendColors[smc.trend])}>{smc.trend}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Internal Trend</p>
          <p className={cn('font-semibold capitalize', trendColors[smc.internalTrend])}>
            {smc.internalTrend}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Zone</p>
          <p className="font-semibold">{zoneLabels[smc.zone]}</p>
        </div>
      </div>

      {smc.zones && (
        <div className="grid grid-cols-3 gap-2 mb-4 text-xs">
          <div className="rounded bg-red-50 px-2 py-1.5 border border-red-100">
            <span className="text-muted-foreground">Premium</span>
            <p className="font-mono font-medium">${smc.zones.premium.toFixed(2)}</p>
          </div>
          <div className="rounded bg-slate-50 px-2 py-1.5 border">
            <span className="text-muted-foreground">Equilibrium</span>
            <p className="font-mono font-medium">${smc.zones.equilibrium.toFixed(2)}</p>
          </div>
          <div className="rounded bg-green-50 px-2 py-1.5 border border-green-100">
            <span className="text-muted-foreground">Discount</span>
            <p className="font-mono font-medium">${smc.zones.discount.toFixed(2)}</p>
          </div>
        </div>
      )}

      <ul className="space-y-1 mb-4">
        {smc.signals.map((s) => (
          <li key={s} className="text-sm flex items-start gap-2">
            <span className="text-sky-600">•</span>
            {s}
          </li>
        ))}
      </ul>

      {smc.structureSignals.length > 0 && (
        <div className="border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Recent structure breaks</p>
          <div className="flex flex-wrap gap-1.5">
            {smc.structureSignals.slice(-6).map((sig, i) => (
              <Badge
                key={`${sig.time}-${sig.type}-${i}`}
                variant="outline"
                className={cn(
                  'text-xs',
                  sig.bias === 'bullish' ? 'border-green-300 text-green-700' : 'border-red-300 text-red-700'
                )}
              >
                {sig.type} · {sig.structure} · {sig.bias}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-3">
        Chart overlays: BOS/CHoCH markers, order blocks (blue/red bands), FVG levels, premium/discount
        lines.
      </p>
    </div>
  );
}
