import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type TradingRiskLevel = Database['public']['Enums']['trading_risk_level'];

export const TradingPreferencesComponent = () => {
  const [maxPosition, setMaxPosition] = useState('1000');
  const [riskLevel, setRiskLevel] = useState<TradingRiskLevel>('conservative');
  const [maxTrades, setMaxTrades] = useState('3');
  const [stopLoss, setStopLoss] = useState('2');
  const [takeProfit, setTakeProfit] = useState('5');

  const { data: preferences, isLoading } = useQuery({
    queryKey: ['tradingPreferences'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const { data, error } = await supabase
        .from('user_trading_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  // Update form when preferences are loaded
  useEffect(() => {
    if (preferences) {
      setMaxPosition(preferences.max_position_size.toString());
      setRiskLevel(preferences.risk_level);
      setMaxTrades(preferences.max_daily_trades.toString());
      setStopLoss(preferences.stop_loss_percentage.toString());
      setTakeProfit(preferences.take_profit_percentage.toString());
    }
  }, [preferences]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('No user found');
        return;
      }

      const { error } = await supabase.from('user_trading_preferences').upsert({
        user_id: user.id,
        max_position_size: parseFloat(maxPosition),
        risk_level: riskLevel,
        max_daily_trades: parseInt(maxTrades),
        stop_loss_percentage: parseFloat(stopLoss),
        take_profit_percentage: parseFloat(takeProfit),
      });

      if (error) throw error;
      toast.success('Trading preferences updated successfully');
    } catch (error) {
      console.error('Error updating preferences:', error);
      toast.error('Failed to update trading preferences');
    }
  };

  if (isLoading) {
    return <div>Loading preferences...</div>;
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Risk Management Settings</CardTitle>
        <CardDescription>
          Configure your trading preferences and risk management parameters.
          Please note that these settings are crucial for responsible trading.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="maxPosition">Maximum Position Size ($)</Label>
            <Input
              id="maxPosition"
              type="number"
              min="0"
              step="100"
              value={maxPosition}
              onChange={(e) => setMaxPosition(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              The maximum amount you're willing to invest in a single trade.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="riskLevel">Risk Level</Label>
            <Select value={riskLevel} onValueChange={(value: TradingRiskLevel) => setRiskLevel(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select risk level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conservative">Conservative</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="aggressive">Aggressive</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Your risk tolerance level affects trading strategies and position sizing.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxTrades">Maximum Daily Trades</Label>
            <Input
              id="maxTrades"
              type="number"
              min="1"
              max="10"
              value={maxTrades}
              onChange={(e) => setMaxTrades(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Limit the number of trades per day to manage risk.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="stopLoss">Stop Loss Percentage (%)</Label>
            <Input
              id="stopLoss"
              type="number"
              min="0.1"
              step="0.1"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Automatic sell trigger to limit potential losses.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="takeProfit">Take Profit Percentage (%)</Label>
            <Input
              id="takeProfit"
              type="number"
              min="0.1"
              step="0.1"
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Automatic sell trigger to secure profits.
            </p>
          </div>

          <div className="pt-4">
            <Button type="submit" className="w-full">
              Save Preferences
            </Button>
          </div>

          <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
            <h4 className="text-sm font-medium text-yellow-800">Important Risk Disclaimer</h4>
            <p className="text-sm text-yellow-700 mt-1">
              Trading involves substantial risk of loss. Past performance is not indicative of future results.
              Set your risk parameters carefully and never invest more than you can afford to lose.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

// Export with a different name to avoid conflicts
export { TradingPreferencesComponent as TradingPreferences };