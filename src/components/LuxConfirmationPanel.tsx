import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SparklesIcon } from 'lucide-react';

export interface LuxConfirmationData {
  signal: string;
  isStrong?: boolean;
  classification?: number;
  classificationLabel?: string;
  candleTrend?: string;
  candleColor?: string;
  recommendation?: string;
  exitSignal?: boolean;
  signals?: string[];
  filters?: {
    smartTrail?: { pass: boolean; trailingStop?: number; reason?: string };
    trendStrength?: { pass: boolean; state?: string; reason?: string };
  };
  presetHint?: string;
  reference?: string;
}

const signalLabel: Record<string, string> = {
  strong_buy: 'Strong Buy (+)',
  buy: 'Buy',
  sell: 'Sell',
  strong_sell: 'Strong Sell (+)',
  none: 'No signal',
};

export function LuxConfirmationPanel({ lux }: { lux: LuxConfirmationData }) {
  const signal = lux.signal ?? 'none';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <SparklesIcon size={18} className="text-violet-600" />
          Lux Confirmation
        </CardTitle>
        <CardDescription>
          Open approximation of LuxAlgo Confirmation + Smart Trail + Trend Strength filters (not the
          paid TradingView script).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={
              signal === 'strong_buy'
                ? 'bg-emerald-600'
                : signal === 'buy'
                  ? 'bg-emerald-100 text-emerald-900'
                  : signal.includes('sell')
                    ? 'bg-red-100 text-red-900'
                    : 'bg-slate-100 text-slate-700'
            }
          >
            {signalLabel[signal] ?? signal}
          </Badge>
          {lux.classification != null && (
            <Badge variant="outline">Level {lux.classification} · {lux.classificationLabel}</Badge>
          )}
          {lux.candleColor && (
            <Badge variant="outline" className="capitalize">
              Candles: {lux.candleColor}
            </Badge>
          )}
          {lux.exitSignal && (
            <Badge variant="destructive" className="text-xs">
              Exit suggested
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div
            className={`rounded border p-2 ${lux.filters?.smartTrail?.pass ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50'}`}
          >
            <p className="font-medium">Smart Trail filter</p>
            <p className="text-muted-foreground mt-0.5">
              {lux.filters?.smartTrail?.reason ?? '—'}
              {lux.filters?.smartTrail?.trailingStop != null && (
                <> · stop ${lux.filters.smartTrail.trailingStop}</>
              )}
            </p>
          </div>
          <div
            className={`rounded border p-2 ${lux.filters?.trendStrength?.pass ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50'}`}
          >
            <p className="font-medium">Trend strength filter</p>
            <p className="text-muted-foreground mt-0.5">
              {lux.filters?.trendStrength?.reason ?? '—'} ({lux.filters?.trendStrength?.state})
            </p>
          </div>
        </div>

        {lux.signals && lux.signals.length > 0 && (
          <ul className="text-xs text-muted-foreground space-y-1">
            {lux.signals.map((s) => (
              <li key={s}>• {s}</li>
            ))}
          </ul>
        )}

        {lux.presetHint && (
          <p className="text-xs text-muted-foreground border-t pt-2">{lux.presetHint}</p>
        )}
      </CardContent>
    </Card>
  );
}
