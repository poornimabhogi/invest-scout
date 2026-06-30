import { Badge } from '@/components/ui/badge';
import { UtBotAnalysis } from '@/types/utBot';
import { cn } from '@/lib/utils';

interface UtBotPanelProps {
  utBot: UtBotAnalysis;
}

export function UtBotPanel({ utBot }: UtBotPanelProps) {
  const recColors = {
    buy: 'bg-green-100 text-green-800 border-green-200',
    watch: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    avoid: 'bg-red-100 text-red-800 border-red-200',
  };

  const posColors = {
    long: 'text-green-600',
    short: 'text-red-600',
    neutral: 'text-muted-foreground',
  };

  return (
    <div className="bg-white rounded-lg border p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold">UT Bot Alerts</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{utBot.attribution}</p>
        </div>
        <Badge className={cn('border', recColors[utBot.recommendation])}>
          {utBot.recommendation.toUpperCase()}
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">UT Score</p>
          <p className="font-bold text-lg">{utBot.utScore}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Position</p>
          <p className={cn('font-semibold capitalize', posColors[utBot.position])}>{utBot.position}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Trailing stop</p>
          <p className="font-semibold font-mono">
            {utBot.trailingStop != null ? `$${utBot.trailingStop.toFixed(2)}` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">ATR × Key</p>
          <p className="font-semibold">
            {utBot.atrPeriod} × {utBot.keyValue}
          </p>
        </div>
      </div>

      <ul className="space-y-1 mb-3">
        {utBot.signals.map((s) => (
          <li key={s} className="text-sm flex items-start gap-2">
            <span className="text-emerald-600">•</span>
            {s}
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        ATR trailing stop with crossover entries. Green UT Buy / red UT Sell markers on chart. Best used
        with SMC + MSB confluence for timing.
      </p>
    </div>
  );
}
