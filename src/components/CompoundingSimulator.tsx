import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertTriangleIcon } from 'lucide-react';
import { api } from '@/lib/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

export function CompoundingSimulator() {
  const [capital, setCapital] = useState('10000');
  const [tradesPerDay, setTradesPerDay] = useState('1');
  const [days, setDays] = useState('30');
  const [winRate, setWinRate] = useState('');
  const [avgWin, setAvgWin] = useState('');
  const [avgLoss, setAvgLoss] = useState('');
  const [simulation, setSimulation] = useState<Awaited<ReturnType<typeof api.simulateCompound>> | null>(
    null
  );

  const { data: backtest } = useQuery({
    queryKey: ['backtestSummary'],
    queryFn: () => api.getBacktestSummary(),
    staleTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (backtest && !winRate) {
      setWinRate(backtest.winRate.toString());
      setAvgWin(backtest.avgWinPct.toString());
      setAvgLoss(backtest.avgLossPct.toString());
    }
  }, [backtest, winRate]);

  const handleSimulate = async () => {
    const result = await api.simulateCompound({
      startingCapital: parseFloat(capital),
      winRatePct: parseFloat(winRate),
      avgWinPct: parseFloat(avgWin),
      avgLossPct: parseFloat(avgLoss),
      tradesPerDay: parseInt(tradesPerDay),
      days: parseInt(days),
      positionPct: 100,
    });
    setSimulation(result);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Compounding Simulator</CardTitle>
        <CardDescription>
          Project growth using historical win rates — hypothetical, not guaranteed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {backtest && (
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <p className="font-medium mb-1">Backtested top-pick signals (90 days)</p>
            <p className="text-muted-foreground">
              {backtest.winRate}% win rate across {backtest.sampleTrades} trades on{' '}
              {backtest.symbolsTested} symbols · avg win {backtest.avgWinPct}% / loss{' '}
              {backtest.avgLossPct}%
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Starting capital ($)</Label>
            <Input value={capital} onChange={(e) => setCapital(e.target.value)} type="number" />
          </div>
          <div>
            <Label>Win rate (%)</Label>
            <Input value={winRate} onChange={(e) => setWinRate(e.target.value)} type="number" />
          </div>
          <div>
            <Label>Avg win (%)</Label>
            <Input value={avgWin} onChange={(e) => setAvgWin(e.target.value)} type="number" step="0.1" />
          </div>
          <div>
            <Label>Avg loss (%)</Label>
            <Input value={avgLoss} onChange={(e) => setAvgLoss(e.target.value)} type="number" step="0.1" />
          </div>
          <div>
            <Label>Trades per day</Label>
            <Input value={tradesPerDay} onChange={(e) => setTradesPerDay(e.target.value)} type="number" />
          </div>
          <div>
            <Label>Days to simulate</Label>
            <Input value={days} onChange={(e) => setDays(e.target.value)} type="number" />
          </div>
        </div>

        <Button onClick={handleSimulate} className="w-full">
          Run Simulation
        </Button>

        {simulation && (
          <div className="space-y-4 border-t pt-4">
            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              <div className="bg-green-50 rounded p-2">
                <p className="text-muted-foreground text-xs">Expected</p>
                <p className="font-bold text-green-700">${simulation.endingCapital.toLocaleString()}</p>
                <p className="text-xs">+{simulation.totalReturnPct}%</p>
              </div>
              <div className="bg-yellow-50 rounded p-2">
                <p className="text-muted-foreground text-xs">Pessimistic</p>
                <p className="font-bold">${simulation.pessimisticEnding.toLocaleString()}</p>
              </div>
              <div className="bg-blue-50 rounded p-2">
                <p className="text-muted-foreground text-xs">Optimistic</p>
                <p className="font-bold">${simulation.optimisticEnding.toLocaleString()}</p>
              </div>
            </div>

            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={simulation.curve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, 'Capital']} />
                  <Line type="monotone" dataKey="capital" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex gap-2 text-xs text-amber-800 bg-amber-50 p-2 rounded">
              <AlertTriangleIcon size={14} className="shrink-0 mt-0.5" />
              <span>{simulation.disclaimer}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
