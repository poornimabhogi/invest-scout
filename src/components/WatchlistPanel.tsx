import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  EyeIcon,
  RefreshCwIcon,
  PinIcon,
  PinOffIcon,
  BanIcon,
  Settings2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckCircle2Icon,
  XCircleIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { WatchlistCriteria, WatchlistItem } from '@/types/watchlist';

function formatCap(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function WatchlistRow({
  item,
  onPin,
  onUnpin,
  onExclude,
}: {
  item: WatchlistItem;
  onPin: (s: string) => void;
  onUnpin: (s: string) => void;
  onExclude: (s: string) => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="p-4 rounded-lg border bg-white hover:shadow-sm transition-shadow">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <button
          type="button"
          onClick={() => navigate(`/stock/${item.symbol}`)}
          className="text-left"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl font-bold hover:text-sky-600">{item.symbol}</span>
            {item.isPinned && (
              <Badge className="bg-amber-100 text-amber-800 text-xs gap-1">
                <PinIcon size={10} />
                Pinned
              </Badge>
            )}
            {item.isTopPick && <Badge className="bg-violet-100 text-violet-800 text-xs">Top Pick</Badge>}
            <Badge variant="outline" className="text-xs">
              Score {item.watchlistScore}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{item.name}</p>
        </button>
        <div className="text-right">
          <p className="text-lg font-bold">${item.price.toFixed(2)}</p>
          <p
            className={cn(
              'text-sm font-medium',
              item.changePercentage >= 0 ? 'text-green-600' : 'text-red-600'
            )}
          >
            {item.changePercentage >= 0 ? '+' : ''}
            {item.changePercentage.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {item.matchReasons.map((r) => (
          <Badge
            key={r.key}
            variant="outline"
            className={cn(
              'text-xs gap-1',
              r.ok ? 'border-green-300 text-green-800 bg-green-50' : 'border-red-200 text-red-700 bg-red-50'
            )}
          >
            {r.ok ? <CheckCircle2Icon size={10} /> : <XCircleIcon size={10} />}
            {r.label}
          </Badge>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {item.sector} · Cap {formatCap(item.marketCap)} · Vol {formatCap(item.volume)}
        </span>
        <div className="flex gap-1">
          {item.isPinned ? (
            <Button size="sm" variant="ghost" className="h-7" onClick={() => onUnpin(item.symbol)}>
              <PinOffIcon size={14} />
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="h-7" onClick={() => onPin(item.symbol)}>
              <PinIcon size={14} />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => onExclude(item.symbol)}>
            <BanIcon size={14} />
          </Button>
          <Button size="sm" variant="outline" className="h-7" onClick={() => navigate(`/stock/${item.symbol}`)}>
            Chart
          </Button>
        </div>
      </div>
    </div>
  );
}

function CriteriaEditor({
  criteria,
  onChange,
  onSave,
  saving,
}: {
  criteria: WatchlistCriteria;
  onChange: (c: Partial<WatchlistCriteria>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const fields: { key: keyof WatchlistCriteria; label: string; step?: number }[] = [
    { key: 'minChangePct', label: 'Min % change today', step: 0.1 },
    { key: 'maxChangePct', label: 'Max % change today', step: 0.5 },
    { key: 'minVolumeRatio', label: 'Min volume vs avg', step: 0.05 },
    { key: 'minMarketCap', label: 'Min market cap ($)', step: 100000000 },
    { key: 'rsiMin', label: 'RSI min', step: 1 },
    { key: 'rsiMax', label: 'RSI max', step: 1 },
    { key: 'minCompositeScore', label: 'Min composite score', step: 0.5 },
    { key: 'minCelebrityScore', label: 'Min celebrity holders', step: 1 },
    { key: 'minMomentumScore', label: 'Min momentum score', step: 0.5 },
    { key: 'maxItems', label: 'Max watchlist size', step: 1 },
  ];

  return (
    <div className="space-y-4 p-4 rounded-lg border bg-slate-50">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {fields.map(({ key, label, step }) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs">{label}</Label>
            <Input
              type="number"
              step={step}
              value={String(criteria[key] ?? '')}
              onChange={(e) => onChange({ [key]: Number(e.target.value) })}
            />
          </div>
        ))}
        <div className="space-y-1">
          <Label className="text-xs">MACD trend</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={criteria.macdTrend}
            onChange={(e) => onChange({ macdTrend: e.target.value as WatchlistCriteria['macdTrend'] })}
          >
            <option value="any">Any</option>
            <option value="bullish">Bullish</option>
            <option value="bearish">Bearish</option>
            <option value="neutral">Neutral</option>
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Momentum tiers (comma-separated)</Label>
          <Input
            value={criteria.momentumTiers.join(', ')}
            onChange={(e) =>
              onChange({
                momentumTiers: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
              })
            }
          />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input
            type="checkbox"
            id="above50"
            checked={criteria.requireAbove50DayMA}
            onChange={(e) => onChange({ requireAbove50DayMA: e.target.checked })}
          />
          <Label htmlFor="above50" className="text-xs cursor-pointer">
            Require price above 50-day MA
          </Label>
        </div>
      </div>
      <Button onClick={onSave} disabled={saving} size="sm">
        {saving ? 'Saving…' : 'Save custom settings'}
      </Button>
    </div>
  );
}

export function WatchlistPanel() {
  const [showCustomize, setShowCustomize] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftCriteria, setDraftCriteria] = useState<WatchlistCriteria | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => api.getWatchlist(),
    staleTime: 2 * 60 * 1000,
  });

  const criteria = draftCriteria ?? data?.criteria;
  const customDraft = draftCriteria ?? data?.settings.customCriteria ?? data?.criteria;

  const applyData = (next: typeof data) => {
    if (next) queryClient.setQueryData(['watchlist'], next);
  };

  const selectPreset = async (presetId: string) => {
    setSaving(true);
    try {
      const preset = data?.presets.find((p) => p.id === presetId);
      const next = await api.updateWatchlistSettings({
        activePresetId: presetId,
        ...(preset ? { customCriteria: preset } : {}),
      });
      applyData(next);
      setDraftCriteria(null);
      toast.success(`Applied "${preset?.name ?? presetId}" preset`);
    } catch {
      toast.error('Failed to apply preset');
    } finally {
      setSaving(false);
    }
  };

  const saveCustom = async () => {
    if (!customDraft) return;
    setSaving(true);
    try {
      const next = await api.updateWatchlistSettings({
        activePresetId: 'custom',
        customCriteria: customDraft,
      });
      applyData(next);
      setDraftCriteria(null);
      toast.success('Custom watchlist settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handlePin = async (symbol: string) => {
    try {
      applyData(await api.pinWatchlistSymbol(symbol));
    } catch {
      toast.error('Pin failed');
    }
  };

  const handleUnpin = async (symbol: string) => {
    try {
      applyData(await api.unpinWatchlistSymbol(symbol));
    } catch {
      toast.error('Unpin failed');
    }
  };

  const handleExclude = async (symbol: string) => {
    try {
      applyData(await api.excludeWatchlistSymbol(symbol));
      toast.success(`${symbol} removed from watchlist`);
    } catch {
      toast.error('Exclude failed');
    }
  };

  const handleAddPin = async () => {
    const sym = pinInput.trim().toUpperCase();
    if (!sym) return;
    setPinInput('');
    await handlePin(sym);
    toast.success(`${sym} pinned to watchlist`);
  };

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
        <RefreshCwIcon className="animate-spin" size={20} />
        Building watchlist from live indicators…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 p-4 rounded-lg border bg-slate-50">
        <div className="flex items-start gap-3">
          <EyeIcon className="text-sky-600 mt-1" size={28} />
          <div>
            <p className="font-semibold text-lg">Recommended Watchlist</p>
            <p className="text-sm text-muted-foreground max-w-xl">{data.criteria.description}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Active: <strong>{data.criteria.name}</strong> · {data.items.length} stocks · Updated{' '}
              {new Date(data.generatedAt).toLocaleTimeString()}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCwIcon size={14} className={cn(isFetching && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCustomize(!showCustomize)}
            className="gap-2"
          >
            <Settings2Icon size={14} />
            Customize
            {showCustomize ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
          </Button>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Presets</p>
        <div className="flex flex-wrap gap-2">
          {data.presets.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant={data.settings.activePresetId === p.id ? 'default' : 'outline'}
              onClick={() => selectPreset(p.id)}
              disabled={saving}
            >
              {p.name}
            </Button>
          ))}
          <Button
            size="sm"
            variant={data.settings.activePresetId === 'custom' ? 'default' : 'outline'}
            onClick={() => {
              setDraftCriteria(data.settings.customCriteria ?? data.criteria);
              setShowCustomize(true);
            }}
          >
            My Custom
          </Button>
        </div>
      </div>

      {showCustomize && customDraft && (
        <CriteriaEditor
          criteria={customDraft}
          onChange={(partial) =>
            setDraftCriteria({ ...(draftCriteria ?? customDraft), ...partial })
          }
          onSave={saveCustom}
          saving={saving}
        />
      )}

      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label className="text-xs">Pin any symbol to always include</Label>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. NVDA"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleAddPin()}
            />
            <Button onClick={handleAddPin} variant="outline">
              Pin
            </Button>
          </div>
        </div>
        {data.settings.pinnedSymbols.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {data.settings.pinnedSymbols.map((s) => (
              <Badge key={s} variant="secondary" className="gap-1">
                <PinIcon size={10} />
                {s}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.items.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground border rounded-lg bg-white">
            No stocks match your criteria. Try a different preset or loosen filters in Customize.
          </div>
        ) : (
          data.items.map((item) => (
            <WatchlistRow
              key={item.symbol}
              item={item}
              onPin={handlePin}
              onUnpin={handleUnpin}
              onExclude={handleExclude}
            />
          ))
        )}
      </div>

      {criteria && (
        <div className="text-xs text-muted-foreground p-3 rounded border bg-white">
          <strong>Current filters:</strong> Change {criteria.minChangePct}% to {criteria.maxChangePct}% ·
          Volume ≥{criteria.minVolumeRatio}× · RSI {criteria.rsiMin}–{criteria.rsiMax} · MACD{' '}
          {criteria.macdTrend} · Momentum: {criteria.momentumTiers.join(', ')} · Max {criteria.maxItems}{' '}
          stocks
        </div>
      )}
    </div>
  );
}
