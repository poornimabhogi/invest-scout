import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChartIcon } from 'lucide-react';

const INDICATORS = [
  {
    name: 'MACD',
    tradingView: 'Fast 12 · Slow 26 · Signal 9 (not 12, 9, 26)',
    usedHere: true,
    signal: 'Blue MACD line crosses orange signal line → momentum shift',
    read: 'MACD line = EMA(12) − EMA(26). Signal = EMA(9) of that line. Histogram = MACD − Signal. The middle number 9 is signal smoothing — the slow EMA is 26.',
    tvTip: 'TradingView: MACD indicator → Fast Length 12, Slow Length 26, Signal Smoothing 9. Source = close.',
  },
  {
    name: 'RSI',
    tradingView: 'Relative Strength Index (14)',
    usedHere: true,
    signal: 'Below 35 oversold · Above 70 overbought',
    read: 'We reduce bullish drift above RSI 70 and boost it below 35. Overbought traps are a top miss reason in Self Analyze.',
    tvTip: 'TradingView: RSI with horizontal lines at 30/70. Divergence (price high, RSI lower) = hidden weakness.',
  },
  {
    name: 'Moving Averages',
    tradingView: 'SMA 20 / 50 / 200',
    usedHere: true,
    signal: 'Price above 50 & 200 MA = golden trend',
    read: 'Short-term breakout above 20-day MA adds momentum signals. Death cross (50 below 200) = caution.',
    tvTip: 'TradingView: Add MA 20, 50, 200. Many traders use 9/21 EMA for faster intraday signals.',
  },
  {
    name: 'Volume',
    tradingView: 'Volume histogram',
    usedHere: true,
    signal: 'Volume spike (>1.5× avg) = institutional interest',
    read: 'Breakouts on low volume are less trusted. Volume confirms Media Radar and momentum picks.',
    tvTip: 'TradingView: Volume bars colored by candle direction. Compare to Volume MA(20).',
  },
  {
    name: 'ATR Bands',
    tradingView: 'Average True Range',
    usedHere: true,
    signal: 'Sets tomorrow low/high forecast range',
    read: 'Wider ATR = more volatile name. Self Analyze widens this multiplier when forecasts miss the range.',
    tvTip: 'TradingView: ATR(14) as a separate pane or use Keltner/Bollinger for visual bands.',
  },
  {
    name: 'TTM Squeeze',
    tradingView: 'TTM Squeeze (BB inside KC)',
    usedHere: true,
    signal: 'Squeeze ON → fired with momentum direction',
    read: 'Volatility compression before expansion. Bullish fire + momentum used in strategy score and 7-indicator audit.',
    tvTip: 'TradingView: TTM Squeeze — red dots = squeeze on, green/red momentum histogram after fire.',
  },
  {
    name: 'Smart Money Concepts (SMC)',
    tradingView: 'Order blocks · BOS · CHoCH',
    usedHere: true,
    signal: 'Buy zone / bullish trend / structure break',
    read: 'Self Analyze and auto-trade require SMC confirmation as part of the 7-indicator audit.',
    tvTip: 'TradingView: LuxAlgo SMC or similar — look for bullish order blocks in discount zone.',
  },
  {
    name: 'MSB-OB (Market Structure Break)',
    tradingView: 'EmreKb MSB + order blocks',
    usedHere: true,
    signal: 'Bullish MSB with order block support',
    read: 'Dual structure (SMC + MSB) boosts Top Pick confluence and auto-trade priority.',
    tvTip: 'TradingView: MSB indicator — confirm break of structure with retest of OB.',
  },
  {
    name: 'UT Bot Alerts',
    tradingView: 'ATR trailing stop (Key Value 1 · ATR 10)',
    usedHere: true,
    signal: 'Long above trailing stop · short below',
    read: 'ATR-based trend filter. Triple confluence when SMC + MSB + UT Bot align.',
    tvTip: 'TradingView: UT Bot Alerts — green = long, red = short; use with structure tools.',
  },
  {
    name: 'OTE (Optimal Trade Entry)',
    tradingView: '62–79% Fibonacci retracement',
    usedHere: true,
    signal: 'Price in bullish OTE zone with structure',
    read: 'Premium entry when OTE overlaps SMC + MSB. Auto-trade buys premium-entry signals first.',
    tvTip: 'TradingView: Auto Fib Retracement — OTE zone between 0.618 and 0.786.',
  },
  {
    name: 'Lux Confirmation (approx.)',
    tradingView: 'LuxAlgo Signals & Overlays™ (invite-only)',
    usedHere: true,
    signal: 'Buy / Strong Buy (+) with Smart Trail + Trend Strength filters',
    read: 'Open approximation of LuxAlgo confirmation mode — uses UT Bot as Smart Trail, momentum tier as trend strength, green-candle hold for strong signals. Not the paid Pine script.',
    tvTip: 'TradingView: LuxAlgo Premium — enable Confirmation + Smart Trail filter + Trend Strength filter preset.',
  },
  {
    name: 'Bollinger Bands',
    tradingView: 'BB(20, 2)',
    usedHere: false,
    signal: 'Price at lower band = stretch · Squeeze = breakout setup',
    read: 'Not on our chart yet — similar to ATR range logic. Squeeze (narrow bands) often precedes big moves.',
    tvTip: 'TradingView: Bollinger Bands default 20,2. Walk the bands in strong trends; fade at extremes in ranges.',
  },
  {
    name: 'Stochastic',
    tradingView: 'Stoch (14, 3, 3)',
    usedHere: false,
    signal: '%K crosses %D in extreme zones',
    read: 'Complements RSI for overbought/oversold. Faster, noisier — best on 1H–1D swing trades.',
    tvTip: 'TradingView: Stochastic RSI is a popular variant for tighter entries.',
  },
  {
    name: 'VWAP',
    tradingView: 'Volume Weighted Average Price',
    usedHere: false,
    signal: 'Intraday fair value anchor',
    read: 'Institutions benchmark vs VWAP on 1D charts. Above VWAP = bullish session bias.',
    tvTip: 'TradingView: Anchored VWAP from earnings day or swing low for trend context.',
  },
];

export function ChartIndicatorsGuide() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <LineChartIcon size={20} className="text-sky-600" />
          Chart Algorithms (TradingView-style)
        </CardTitle>
        <CardDescription>
          How our signals map to indicators you&apos;d use on TradingView. Open any stock chart to see
          MACD, RSI, MAs, and volume in action.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {INDICATORS.map((ind) => (
            <div key={ind.name} className="p-4 rounded-lg border bg-white space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold">{ind.name}</h4>
                {ind.usedHere ? (
                  <Badge className="bg-green-100 text-green-800 text-xs">Active here</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    TradingView
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{ind.tradingView}</p>
              <p className="text-sm">
                <span className="font-medium">Signal: </span>
                {ind.signal}
              </p>
              <p className="text-sm text-muted-foreground">{ind.read}</p>
              <p className="text-xs bg-slate-50 p-2 rounded border-l-2 border-sky-400">{ind.tvTip}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
