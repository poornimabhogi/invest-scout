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
import { BotIcon, PlayIcon, RefreshCwIcon, TargetIcon, PieChartIcon } from 'lucide-react';

const STRATEGY_LABELS: Record<string, string> = {
  'top-pick': 'Top Pick',
  'chart-verified': 'Chart Verified',
  'premium-entry': 'Premium OTE',
  'lux-confirmation': 'Lux Confirm',
  'lux-strong': 'Lux Strong +',
  'lux-exit': 'Lux Exit',
  'stop-loss': 'Stop Loss',
  'take-profit': 'Take Profit',
  'signal-exit': 'Signal Exit',
  'wvf-capitulation': 'WVF Capitulation',
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
    if (!settings) return;
    if (enabled && settings.useCapSplitting !== false && !(settings.investmentAmount ?? 0)) {
      toast.error('Set an investment amount before enabling cap-split auto-trade');
      return;
    }
    await saveSettings({ enabled });
    toast.success(enabled ? 'Auto-trade enabled' : 'Auto-trade paused');
  };

  const handleAccuracyMode = async (enable: boolean) => {
    try {
      await api.applyPaperAutoTradeAccuracyMode(enable);
      queryClient.invalidateQueries({ queryKey: ['paperAutoTrade'] });
      queryClient.invalidateQueries({ queryKey: ['paperPortfolio'] });
      queryClient.invalidateQueries({ queryKey: ['tradingPreferences'] });
      toast.success(
        enable
          ? 'Accuracy mode on — ≥4/7 bullish, dual structure, conservative risk'
          : 'Standard mode restored'
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to apply mode');
    }
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

  const cap = data?.capAllocation;
  const splitSum =
    (settings.splitLargePct ?? 50) + (settings.splitMidPct ?? 25) + (settings.splitSmallPct ?? 25);
  const stats = data?.strategyStats ?? {};

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
        {settings.accuracyMode && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900">
            <p className="font-semibold flex items-center gap-1.5">
              <TargetIcon size={14} />
              Accuracy mode active
            </p>
            <p className="text-emerald-800/90 mt-0.5">
              Top picks need ≥4/7 bullish, ≤2 bearish, dual structure or premium OTE, strategy score
              ≥{settings.minStrategyScore}, chart perf ≥{settings.minVerifiedPerfScore}. Lux strong
              confirmation enabled. Max 2 buys/day (Trading Preferences).
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={settings.accuracyMode ? 'default' : 'outline'}
            className="gap-1"
            onClick={() => handleAccuracyMode(true)}
          >
            <TargetIcon size={14} />
            Accuracy mode
          </Button>
          {settings.accuracyMode && (
            <Button size="sm" variant="ghost" onClick={() => handleAccuracyMode(false)}>
              Use standard mode
            </Button>
          )}
        </div>

        <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold flex items-center gap-1.5 text-sky-900">
              <PieChartIcon size={15} />
              Smart cap split
            </p>
            <Switch
              checked={settings.useCapSplitting !== false}
              onCheckedChange={(v) => saveSettings({ useCapSplitting: v })}
            />
          </div>
          <p className="text-xs text-sky-800/90">
            Large cap = safe setup (chart verified, Lux, premium OTE). Mid/small use the same
            signals with lighter gates so you can test strategies across cap sizes.
          </p>

          {settings.useCapSplitting !== false && (
            <>
              <div>
                <Label className="text-xs">Total to invest ($)</Label>
                <Input
                  type="number"
                  min={1000}
                  step={1000}
                  value={settings.investmentAmount ?? 100_000}
                  onChange={(e) => saveSettings({ investmentAmount: Number(e.target.value) })}
                  className="h-8 mt-1"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: 'splitLargePct', label: 'Large (safe)', def: 50 },
                    { key: 'splitMidPct', label: 'Mid', def: 25 },
                    { key: 'splitSmallPct', label: 'Small', def: 25 },
                  ] as const
                ).map(({ key, label, def }) => (
                  <div key={key}>
                    <Label className="text-xs">{label} %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={settings[key] ?? def}
                      onChange={(e) => saveSettings({ [key]: Number(e.target.value) })}
                      className="h-8 mt-1"
                    />
                  </div>
                ))}
              </div>

              {Math.abs(splitSum - 100) > 0.5 && (
                <p className="text-xs text-amber-800">
                  Split totals {splitSum}% — will normalize to 100% when trading.
                </p>
              )}

              {cap?.enabled && (
                <div className="space-y-2 text-xs">
                  <p className="font-medium text-sky-900">Allocation (${cap.investmentAmount.toLocaleString()})</p>
                  {(['large', 'mid', 'small'] as const).map((tier) => (
                    <div key={tier} className="space-y-1">
                      <div className="flex justify-between text-muted-foreground capitalize">
                        <span>
                          {tier} · {cap.splits[tier]}%
                        </span>
                        <span>
                          ${cap.deployed[tier].toLocaleString()} / ${cap.budgets[tier].toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-sky-100 overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            tier === 'large' && 'bg-blue-500',
                            tier === 'mid' && 'bg-indigo-500',
                            tier === 'small' && 'bg-amber-500'
                          )}
                          style={{
                            width: `${Math.min(100, cap.budgets[tier] > 0 ? (cap.deployed[tier] / cap.budgets[tier]) * 100 : 0)}%`,
                          }}
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        ${cap.remaining[tier].toLocaleString()} remaining
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

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
              checked={settings.buyLuxConfirmation ?? false}
              onCheckedChange={(v) => saveSettings({ buyLuxConfirmation: v })}
            />
            Lux confirmation
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={settings.buyLuxStrongOnly !== false}
              onCheckedChange={(v) => saveSettings({ buyLuxStrongOnly: v })}
              disabled={!settings.buyLuxConfirmation}
            />
            Strong only (+)
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={settings.buyGainzAlgo ?? false}
              onCheckedChange={(v) => saveSettings({ buyGainzAlgo: v })}
            />
            GainzAlgo (free)
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={settings.buyWvfCapitulation ?? false}
              onCheckedChange={(v) => saveSettings({ buyWvfCapitulation: v })}
            />
            WVF capitulation
          </label>
          {settings.buyWvfCapitulation && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground shrink-0 text-xs">Min core bullish</span>
              <Input
                type="number"
                min={1}
                max={7}
                className="h-8 w-16"
                value={settings.wvfMinCoreBullish ?? 4}
                onChange={(e) => saveSettings({ wvfMinCoreBullish: Number(e.target.value) })}
              />
              <span className="text-xs text-muted-foreground">/7 (excl. WVF)</span>
            </label>
          )}
          {settings.buyGainzAlgo && (
            <label className="flex items-center gap-2 text-sm col-span-full">
              <span className="text-muted-foreground shrink-0">Mode</span>
              <select
                className="border rounded px-2 py-1 text-sm bg-background"
                value={settings.gainzAlgoMode ?? 'standard'}
                onChange={(e) =>
                  saveSettings({
                    gainzAlgoMode: e.target.value as 'standard' | 'alpha' | 'pro',
                  })
                }
              >
                <option value="standard">Standard (4-layer)</option>
                <option value="alpha">V2 Alpha</option>
                <option value="pro">Pro score</option>
              </select>
            </label>
          )}
          <label className="flex items-center gap-2">
            <Switch
              checked={settings.requireChartAudit ?? true}
              onCheckedChange={(v) => saveSettings({ requireChartAudit: v })}
            />
            8-indicator audit
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
              checked={settings.requireDualStructureForTopPick ?? false}
              onCheckedChange={(v) => saveSettings({ requireDualStructureForTopPick: v })}
              disabled={settings.accuracyMode}
            />
            Dual structure (top pick)
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={settings.sellOnAvoid}
              onCheckedChange={(v) => saveSettings({ sellOnAvoid: v })}
            />
            Exit on avoid
          </label>
        </div>

        {!settings.accuracyMode && (
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div>
              <Label className="text-xs">Min bullish (0–7)</Label>
              <Input
                type="number"
                min={0}
                max={7}
                value={settings.minBullishIndicators ?? 0}
                onChange={(e) => saveSettings({ minBullishIndicators: Number(e.target.value) })}
                className="h-8 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Max bearish (0–7)</Label>
              <Input
                type="number"
                min={0}
                max={7}
                value={settings.maxBearishIndicators ?? 0}
                onChange={(e) => saveSettings({ maxBearishIndicators: Number(e.target.value) })}
                className="h-8 mt-1"
              />
            </div>
          </div>
        )}

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
