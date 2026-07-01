import { cn } from '@/lib/utils';

export interface IndicatorCheck {
  label: string;
  status: 'bullish' | 'bearish' | 'neutral';
  detail: string;
  value?: number | string | null;
}

export interface IndicatorAudit {
  checks: {
    rsi: IndicatorCheck;
    macd: IndicatorCheck;
    squeeze: IndicatorCheck;
    smc: IndicatorCheck;
    msb: IndicatorCheck;
    utBot: IndicatorCheck;
    ote?: IndicatorCheck;
    wvf?: IndicatorCheck;
  };
  summary: { bullish: number; bearish: number; neutral: number; total: number };
  confirmsMedia?: boolean;
  primaryReason?: string;
  rejectionReason?: string;
}

const statusStyles = {
  bullish: 'bg-green-100 text-green-800 border-green-200',
  bearish: 'bg-red-100 text-red-800 border-red-200',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200',
};

const statusIcon = {
  bullish: '✓',
  bearish: '✗',
  neutral: '–',
};

interface ChartIndicatorChecklistProps {
  audit: IndicatorAudit | null | undefined;
  compact?: boolean;
}

export function ChartIndicatorChecklist({ audit, compact = false }: ChartIndicatorChecklistProps) {
  if (!audit?.checks) return null;

  const items = Object.values(audit.checks);

  return (
    <div className={cn(compact ? 'space-y-1' : 'space-y-2')}>
      <div className="flex items-center justify-between gap-2">
        <p className={cn('font-medium text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
          Indicator audit ({audit.summary.bullish}/{audit.summary.total} bullish)
        </p>
        {audit.confirmsMedia != null && (
          <span
            className={cn(
              'text-xs font-semibold px-1.5 py-0.5 rounded',
              audit.confirmsMedia ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'
            )}
          >
            {audit.confirmsMedia ? 'PASS' : 'FAIL'}
          </span>
        )}
      </div>
      <div className={cn('grid gap-1', compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3')}>
        {items.map((check) => (
          <div
            key={check.label}
            className={cn(
              'rounded border px-2 py-1 text-xs',
              statusStyles[check.status]
            )}
            title={check.detail}
          >
            <span className="font-semibold">{statusIcon[check.status]} {check.label}</span>
            {!compact && (
              <p className="truncate opacity-80 mt-0.5">{check.detail}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
