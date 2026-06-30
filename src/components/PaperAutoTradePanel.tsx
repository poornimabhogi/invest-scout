import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { BotIcon, PlayIcon, RefreshCwIcon } from 'lucide-react';

const STRATEGY_LABELS: Record<string, string> = {
  'top-pick': 'Top Pick',
  'chart-verified': 'Chart Verified',
  'premium-entry': 'Premium OTE',
  'stop-loss': 'Stop Loss',
  'take-profit': 'Take Profit',
  'signal-exit': 'Signal Exit',
  manual: 'Manual',
};

export function PaperAutoTradePanel() {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['paperAutoTrade'],
    queryFn: () => api.getPaperAutoTradeStatus(),
    refetchInterval: 60_000,
  });

  const settings = data?.settings;

  const saveSettings = async (partial: Record<string, unknown>) => {
    try {
      await api.updatePaperAutoTradeSettings(partial);
      queryClient.invalidateQueries({ queryKey: ['paperAutoTrade'] });
      queryClient.invalidateQueries({ queryKey: ['paperPortfolio'] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings');
    }
  };

  const handleToggle = async (enabled: boolean) => {
    await saveSettings({ enabled });
    toast.success(enabled ? 'Auto-trade enabled' : 'Auto-trade paused');
  };

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const result = await api.runPaperAutoTrade();
      if (result.skipped) {
        toast.info(result.reason ?? 'Skipped');
      } else if (result.actions?.length) {
        toast.success(`Auto-trade: ${result.actions.length} action(s) executed`);
      } else {
        toast.info('Auto-trade scan complete — no new actions');
      }
      queryClient.invalidateQueries({ queryKey: ['paperAutoTrade'] });
      queryClient.invalidateQueries({ queryKey: ['paperPortfolio'] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Auto-trade run failed');
    } finally {
      setRunning(false);
    }
  };

  if (isLoading || !settings) {
    return <div className="text-sm text-muted-foreground">Loading auto-trade settings…</div>;
  }

  const stats = data.strategyStats ?? {};

  return (
    <Card className="border-dashed border-violet-200 bg-violet-50/30">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <BotIcon size={18} className="text-violet-600" />
              Strategy Auto-Trade
            </CardTitle>
            <CardDescription>
              Paper-only bot — buys Top Picks / chart-verified signals, exits on stop-loss or avoid
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="auto-enabled" className="text-xs text-muted-foreground">
              {settings.enabled ? 'ON' : 'OFF'}
            </Label>
            <Switch
              id="auto-enabled"
              checked={settings.enabled}
              onCheckedChange={handleToggle}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Max positions</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={settings.maxPositions}
              onChange={(e) => saveSettings({ maxPositions: Number(e.target.value) })}
              className="h-8 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Size % of equity</Label>
            <Input
              type="number"
              min={1}
              max={25}
              value={settings.positionSizePct}
              onChange={(e) => saveSettings({ positionSizePct: Number(e.target.value) })}
              className="h-8 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Min strategy score</Label>
            <Input
              type="number"
              min={0}
              value={settings.minStrategyScore}
              onChange={(e) => saveSettings({ minStrategyScore: Number(e.target.value) })}
              className="h-8 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Min chart perf</Label>
            <Input
              type="number"
              min={0}
              value={settings.minVerifiedPerfScore}
              onChange={(e) => saveSettings({ minVerifiedPerfScore: Number(e.target.value) })}
              className="h-8 mt-1"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            <Switch
              checked={settings.buyTopPicks}
              onCheckedChange={(v) => saveSettings({ buyTopPicks: v })}
            />
            Top Picks
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={settings.buyChartVerified}
              onCheckedChange={(v) => saveSettings({ buyChartVerified: v })}
            />
            Chart verified
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={settings.buyPremiumEntry}
              onCheckedChange={(v) => saveSettings({ buyPremiumEntry: v })}
            />
            Premium OTE
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={settings.requireChartAudit ?? true}
              onCheckedChange={(v) => saveSettings({ requireChartAudit: v })}
            />
            7-indicator audit
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={settings.applySelfAnalyzeGates ?? true}
              onCheckedChange={(v) => saveSettings({ applySelfAnalyzeGates: v })}
            />
            Self-analyze gate
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={settings.sellOnAvoid}
              onCheckedChange={(v) => saveSettings({ sellOnAvoid: v })}
            />
            Exit on avoid
          </label>
        </div>

        {(data.riskContext || data.selfAnalyzeGate) && (
          <div className="rounded-lg border bg-white p-3 text-xs space-y-1">
            <p className="font-semibold">Risk & compound sync</p>
            {data.riskContext && (
              <p className="text-muted-foreground">
                {data.riskContext.riskLevel} risk · {data.riskContext.positionSizePct}% position · max{' '}
                {data.riskContext.maxDailyTrades} buys/day · min score {data.riskContext.minStrategyScore}
                {data.riskContext.compoundHint && (
                  <>
                    {' '}
                    · 30d compound est. {data.riskContext.compoundHint.projectedReturnPct}% @{' '}
                    {data.riskContext.compoundHint.winRatePct}% win rate
                  </>
                )}
              </p>
            )}
            {data.autoBuysToday != null && (
              <p className="text-muted-foreground">
                Auto-buys today: {data.autoBuysToday} / {data.riskContext?.maxDailyTrades ?? '—'}
              </p>
            )}
            {data.selfAnalyzeGate && !data.selfAnalyzeGate.allow && (
              <p className="text-amber-700">{data.selfAnalyzeGate.reason}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleRunNow} disabled={running} className="gap-1">
            <PlayIcon size={14} />
            Run now
          </Button>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCwIcon size={14} className={cn(isFetching && 'animate-spin')} />
          </Button>
          {settings.lastRunAt && (
            <span className="text-xs text-muted-foreground self-center">
              Last run {new Date(settings.lastRunAt).toLocaleString()}
            </span>
          )}
        </div>

        {Object.keys(stats).length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Trades by strategy</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats).map(([key, s]) => (
                <Badge key={key} variant="outline" className="text-xs">
                  {STRATEGY_LABELS[key] ?? key}: {s.buys}B / {s.sells}S
                </Badge>
              ))}
            </div>
          </div>
        )}

        {settings.lastActions?.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">Recent auto actions</h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {settings.lastActions.slice(0, 8).map((a, i) => (
                <div key={`${a.at}-${i}`} className="text-xs flex justify-between gap-2 border rounded px-2 py-1 bg-white">
                  <span>
                    <Badge variant={a.side === 'buy' ? 'default' : 'secondary'} className="mr-1 text-[10px]">
                      {a.side}
                    </Badge>
                    {a.symbol} · {STRATEGY_LABELS[a.strategy] ?? a.strategy}
                  </span>
                  <span className="text-muted-foreground truncate max-w-[40%]">{a.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Runs every 15 min when enabled. Stop-loss / take-profit and daily trade limits use Trading
          Preferences. Position size follows risk level + compound backtest. Also triggers after Media
          Radar scans and Self Analyze runs.
        </p>
      </CardContent>
    </Card>
  );
}
