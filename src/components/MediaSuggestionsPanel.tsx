import { MediaChartSuggestion, MediaIndicatorAuditEntry } from '@/types/media';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BrainCircuitIcon, ExternalLinkIcon, ZapIcon, VideoIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ChartIndicatorChecklist } from '@/components/ChartIndicatorChecklist';

interface MediaSuggestionsPanelProps {
  suggestions: MediaChartSuggestion[];
  audits?: MediaIndicatorAuditEntry[];
  stats?: { scanned: number; passed: number; rejected: number };
  processedAt?: string | null;
}

function timeAgo(iso: string | null | undefined) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export function MediaSuggestionsPanel({ suggestions, audits, stats, processedAt }: MediaSuggestionsPanelProps) {
  const navigate = useNavigate();
  const failedAudits = (audits ?? []).filter((a) => !a.pass).slice(0, 8);

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <BrainCircuitIcon size={20} className="text-sky-600" />
        <h2 className="text-xl font-bold">Chart-verified suggestions</h2>
        {stats && (
          <Badge variant="outline" className="text-xs">
            {stats.passed}/{stats.scanned} passed chart gate
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Flow: scan media → run full chart audit → rank by performance score → high performers
        promote to <strong>Top Picks</strong> (min perf 7, 2+ bullish indicators, not weak momentum).
        {processedAt && ` Last processed ${timeAgo(processedAt)}.`}
      </p>

      {suggestions.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border rounded-lg bg-white">
          <BrainCircuitIcon size={32} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">No chart-confirmed media picks yet</p>
          <p className="text-sm mt-1 max-w-md mx-auto">
            Hit <strong>Scan now</strong> to poll feeds and analyze mentioned stocks. Names appear
            here only when the 7-indicator audit passes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {suggestions.map((s) => (
            <div key={s.symbol} className="p-4 rounded-lg border bg-white hover:shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => navigate(`/stock/${s.symbol}`)}
                    className="text-lg font-bold hover:text-sky-600"
                  >
                    {s.symbol}
                  </button>
                  <Badge
                    className={cn(
                      'text-xs',
                      s.recommendation === 'buy' && 'bg-green-100 text-green-800',
                      s.recommendation === 'watch' && 'bg-yellow-100 text-yellow-800'
                    )}
                  >
                    {s.recommendation.toUpperCase()}
                  </Badge>
                  {s.isEarly && (
                    <Badge className="bg-emerald-100 text-emerald-800 text-xs gap-1">
                      <ZapIcon size={12} />
                      Pre-momentum
                    </Badge>
                  )}
                  {s.mediaContentType === 'video' && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <VideoIcon size={12} />
                      Video{ s.hasTranscript ? ' · transcript' : ''}
                    </Badge>
                  )}
                  {s.topPickEligible && (
                    <Badge className="bg-amber-100 text-amber-900 text-xs">
                      Top Pick eligible
                    </Badge>
                  )}
                  {s.verifiedPerfScore != null && (
                    <Badge variant="outline" className="text-xs font-mono">
                      Perf {s.verifiedPerfScore}
                    </Badge>
                  )}
                </div>
                <div className="text-right text-sm">
                  <span className="font-semibold">${s.price.toFixed(2)}</span>
                  <span
                    className={cn(
                      'ml-2',
                      s.changePercentage >= 0 ? 'text-green-600' : 'text-red-600'
                    )}
                  >
                    {s.changePercentage >= 0 ? '+' : ''}
                    {s.changePercentage.toFixed(2)}%
                  </span>
                </div>
              </div>

              <p className="text-xs text-sky-700 bg-sky-50 rounded px-2 py-1 mb-2">
                Chart: {s.chartReason}
              </p>

              <ChartIndicatorChecklist audit={s.indicatorAudit} compact />

              {s.confluence?.premiumEntry && (
                <p className="text-xs text-violet-700 font-medium mt-2">
                  Premium entry — dual structure + OTE zone ✓
                </p>
              )}
              <a
                href={s.mediaUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium line-clamp-2 flex items-start gap-1 hover:text-sky-600 mt-2"
              >
                {s.mediaHeadline}
                <ExternalLinkIcon size={14} className="shrink-0 mt-0.5 opacity-50" />
              </a>

              {s.figureTags && s.figureTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {s.figureTags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs capitalize">
                      {tag.replace('-', ' ')}
                    </Badge>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{s.rationale}</p>

              <div className="flex justify-end mt-3">
                <Button size="sm" variant="outline" onClick={() => navigate(`/stock/${s.symbol}`)}>
                  View chart
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {failedAudits.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">
            Rejected by chart gate ({failedAudits.length} shown)
          </h3>
          <div className="space-y-2">
            {failedAudits.map((a) => (
              <div key={a.symbol} className="p-3 rounded-lg border bg-slate-50 text-sm">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-bold">{a.symbol}</span>
                  <span className="text-xs text-red-600">{a.reason}</span>
                </div>
                <ChartIndicatorChecklist audit={a.indicatorAudit} compact />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
