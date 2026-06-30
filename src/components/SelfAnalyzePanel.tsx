import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BrainCircuitIcon,
  RefreshCwIcon,
  CheckCircle2Icon,
  XCircleIcon,
  LightbulbIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ChartIndicatorsGuide } from '@/components/ChartIndicatorsGuide';

export function SelfAnalyzePanel() {
  const [running, setRunning] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['selfAnalyze'],
    queryFn: () => api.getSelfAnalyzeState(),
    staleTime: 60 * 1000,
  });

  const report = data?.report;
  const learnings = data?.learnings;

  const handleRun = async () => {
    setRunning(true);
    try {
      const result = await api.runSelfAnalyze(true);
      queryClient.setQueryData(['selfAnalyze'], {
        report: result,
        pendingCount: result.newPredictionsRecorded,
        learnings: {
          weights: result.updatedWeights,
          lessons: (learnings?.lessons ?? []).slice(0, 10),
          stats: result.cumulativeStats,
          lastUpdated: result.generatedAt,
        },
        recentPredictions: data?.recentPredictions ?? [],
      });
      toast.success(
        `Self-analyze complete — ${result.stats.graded} forecasts graded, ${result.indicatorAuditSummary?.confirmsMedia ?? 0}/${result.indicatorAuditSummary?.symbolsAnalyzed ?? 0} chart-audited picks confirmed${result.autoTradeRun?.actions?.length ? `, ${result.autoTradeRun.actions.length} auto-trade action(s)` : ''}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Self-analyze failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BrainCircuitIcon size={20} className="text-violet-600" />
            Self Analyze
          </CardTitle>
          <CardDescription>
            Grades yesterday&apos;s high-confidence tomorrow forecasts vs actual prices, runs the full
            7-indicator chart audit on Top Picks (RSI, MACD, Squeeze, SMC, MSB, UT Bot, OTE), adjusts
            strategy weights, and can trigger paper auto-trade when gates pass.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleRun} disabled={running} className="gap-2">
              <RefreshCwIcon size={16} className={cn(running && 'animate-spin')} />
              {running ? 'Analyzing…' : 'Run Self Analyze'}
            </Button>
            {data?.pendingCount != null && data.pendingCount > 0 && (
              <Badge variant="outline">{data.pendingCount} pending forecasts</Badge>
            )}
            {learnings?.weights?.highConfidenceThreshold != null && (
              <Badge variant="secondary">
                Confidence bar: ≥{learnings.weights.highConfidenceThreshold}%
              </Badge>
            )}
          </div>

          {isLoading && !report && (
            <p className="text-sm text-muted-foreground">Loading analysis state…</p>
          )}

          {report && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-slate-50 border text-sm">
                <p className="font-medium mb-2">{report.summary}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Graded</p>
                    <p className="font-bold text-lg">{report.stats.graded}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">In range</p>
                    <p className="font-bold text-lg text-green-600">{report.stats.rangeAccuracy}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Direction OK</p>
                    <p className="font-bold text-lg">{report.stats.directionAccuracy}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">New picks logged</p>
                    <p className="font-bold text-lg">{report.newPredictionsRecorded}</p>
                  </div>
                </div>
                {report.stats.simulatedHistorical > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Includes {report.stats.simulatedHistorical} simulated historical forecasts (no live
                    journal yet). Run daily after market close for live grading.
                  </p>
                )}
              </div>

              {report.indicatorAuditSummary && report.indicatorAuditSummary.symbolsAnalyzed > 0 && (
                <div className="p-4 rounded-lg bg-violet-50 border border-violet-100 text-sm">
                  <h4 className="font-semibold mb-2">7-indicator chart audit (Top Picks)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                    <div>
                      <p className="text-muted-foreground">Analyzed</p>
                      <p className="font-bold text-lg">{report.indicatorAuditSummary.symbolsAnalyzed}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Chart confirmed</p>
                      <p className="font-bold text-lg text-green-600">
                        {report.indicatorAuditSummary.confirmsMedia}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Avg bullish</p>
                      <p className="font-bold text-lg">{report.indicatorAuditSummary.avgBullish}/7</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Auto-trade ready</p>
                      <p className="font-bold text-lg">{report.autoTradeCandidates?.length ?? 0}</p>
                    </div>
                  </div>
                  {report.autoTradeCandidates && report.autoTradeCandidates.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {report.autoTradeCandidates.slice(0, 8).map((c) => (
                        <Badge key={c.symbol} variant="outline" className="text-xs">
                          {c.symbol} · {c.bullishIndicators}/7 · {c.primaryReason.slice(0, 28)}
                          {c.primaryReason.length > 28 ? '…' : ''}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {report.autoTradeRun && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Auto-trade:{' '}
                      {report.autoTradeRun.skipped
                        ? report.autoTradeRun.reason ?? 'skipped'
                        : `${report.autoTradeRun.actions?.length ?? 0} action(s) executed`}
                    </p>
                  )}
                </div>
              )}

              {report.strategyAdjustments.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                    <LightbulbIcon size={16} className="text-amber-500" />
                    Strategy auto-corrections applied
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {report.strategyAdjustments.map((adj) => (
                      <li key={adj} className="flex items-start gap-2 text-muted-foreground">
                        <CheckCircle2Icon size={14} className="text-green-600 mt-0.5 shrink-0" />
                        {adj}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.whatWentWrong.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                    <XCircleIcon size={16} className="text-red-500" />
                    What went wrong
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {report.whatWentWrong.map((item) => (
                      <div key={`${item.symbol}-${item.targetDate}`} className="p-3 rounded border bg-white text-sm">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <strong>{item.symbol}</strong>
                          <Badge variant="outline" className="text-xs">
                            {item.confidence}% conf
                          </Badge>
                          {item.simulated && (
                            <Badge variant="secondary" className="text-xs">
                              simulated
                            </Badge>
                          )}
                          <span className="text-muted-foreground text-xs">{item.targetDate}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Predicted ${item.predicted?.toFixed(2)} → Actual ${item.actual?.toFixed(2)} (
                          {item.outcome.replace(/_/g, ' ')})
                        </p>
                        <ul className="text-xs space-y-0.5">
                          {item.diagnosis.map((d) => (
                            <li key={d} className="text-red-700/80">
                              • {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {learnings?.lessons && learnings.lessons.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Memory — lessons retained</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {learnings.lessons.slice(0, 5).map((l) => (
                      <li key={`${l.date}-${l.text}`}>
                        {l.date}: {l.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ChartIndicatorsGuide />
    </div>
  );
}
