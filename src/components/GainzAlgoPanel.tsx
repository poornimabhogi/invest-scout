import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LayersIcon } from 'lucide-react';

interface GainzLayer {
  pass: boolean;
  reason?: string;
  bias?: string;
}

interface GainzModeResult {
  mode: string;
  signal: string;
  confidence?: number;
  recommendation?: string;
  layers?: Record<string, GainzLayer>;
  checks?: string[];
  score?: number;
  adaptiveThreshold?: number;
  tpSl?: { takeProfit: number; stopLoss: number } | null;
  disclaimer?: string;
}

export function GainzAlgoPanel({ gainz }: { gainz: { standard: GainzModeResult; alpha: GainzModeResult; pro: GainzModeResult } }) {
  const modes = [
    { key: 'standard', label: 'Standard (4-layer)', data: gainz.standard },
    { key: 'alpha', label: 'V2 Alpha', data: gainz.alpha },
    { key: 'pro', label: 'Pro score', data: gainz.pro },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <LayersIcon size={18} className="text-orange-600" />
          GainzAlgo-inspired (free)
        </CardTitle>
        <CardDescription>
          Open reimplementation — not the paid{' '}
          <a
            href="https://www.tradingview.com/v/h7UO9YR8/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            GainzAlgo Suite
          </a>
          . Official access: gainzalgo.com
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {modes.map(({ key, label, data }) => (
          <div key={key} className="rounded-lg border p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-sm">{label}</span>
              <Badge
                variant={data.signal === 'buy' ? 'default' : data.signal === 'sell' ? 'destructive' : 'secondary'}
                className="text-xs capitalize"
              >
                {data.signal}
              </Badge>
              {data.confidence != null && data.confidence > 0 && (
                <Badge variant="outline" className="text-xs">
                  {data.score != null ? `score ${data.score}` : `${data.confidence}%`}
                  {data.adaptiveThreshold != null && ` / ${data.adaptiveThreshold}`}
                </Badge>
              )}
            </div>

            {data.layers && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                {Object.entries(data.layers).map(([name, layer]) => (
                  <div
                    key={name}
                    className={`rounded px-2 py-1 ${layer.pass ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-muted-foreground'}`}
                  >
                    <span className="font-medium capitalize">{name}</span>: {layer.pass ? '✓' : '✗'}{' '}
                    {layer.reason}
                  </div>
                ))}
              </div>
            )}

            {data.checks && data.checks.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {data.checks.map((c) => (
                  <li key={c}>• {c}</li>
                ))}
              </ul>
            )}

            {data.tpSl && (
              <p className="text-xs text-muted-foreground">
                Suggested TP ${data.tpSl.takeProfit} · SL ${data.tpSl.stopLoss}
              </p>
            )}
          </div>
        ))}

        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded p-2">
          {gainz.standard.disclaimer ??
            'Avoid leaked Pine scripts from gists/Pastebin — they are unofficial and may be unsafe or incomplete.'}
        </p>
      </CardContent>
    </Card>
  );
}
