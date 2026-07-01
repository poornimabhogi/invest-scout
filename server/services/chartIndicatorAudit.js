import { buildStructureConfluence } from './utBot.js';

function checkStatus(label, bullish, bearish, detail, value = null) {
  let status = 'neutral';
  if (bullish) status = 'bullish';
  else if (bearish) status = 'bearish';
  return { label, status, detail, value };
}

export const INDICATOR_AUDIT_TOTAL = 8;

const CORE_INDICATOR_KEYS = ['rsi', 'macd', 'squeeze', 'smc', 'msb', 'utBot', 'ote'];

export function countCoreBullishIndicators(checks) {
  if (!checks) return 0;
  return CORE_INDICATOR_KEYS.filter((k) => checks[k]?.status === 'bullish').length;
}

export function buildIndicatorAudit(chartAnalysis, smc, msb, utBot, ote, recommendation) {
  const macd = chartAnalysis.macd ?? {};
  const squeeze = chartAnalysis.squeeze ?? {};
  const wvf = chartAnalysis.wvf ?? {};
  const rsi = chartAnalysis.rsi ?? 50;

  const checks = {
    rsi: checkStatus(
      'RSI',
      rsi < 42,
      rsi > 70,
      rsi < 42 ? 'Oversold — bounce zone' : rsi > 70 ? 'Overbought' : `Neutral (${rsi})`,
      rsi
    ),
    macd: checkStatus(
      'MACD',
      macd.trend === 'bullish',
      macd.trend === 'bearish',
      macd.trend ?? 'insufficient'
    ),
    squeeze: checkStatus(
      'Squeeze',
      squeeze.squeezeOff && squeeze.momentum === 'bullish',
      squeeze.squeezeOff && squeeze.momentum === 'bearish',
      squeeze.squeezeOff
        ? `Fired ${squeeze.momentum}`
        : squeeze.squeezeOn
          ? 'Squeeze ON — pending'
          : squeeze.momentum ?? 'neutral'
    ),
    smc: checkStatus(
      'SMC',
      smc?.recommendation === 'buy' || smc?.trend === 'bullish',
      smc?.recommendation === 'avoid' || smc?.trend === 'bearish',
      smc ? `${smc.recommendation} · ${smc.trend} · ${smc.zone}` : 'n/a',
      smc?.smcScore ?? null
    ),
    msb: checkStatus(
      'MSB-OB',
      msb?.recommendation === 'buy' || msb?.market === 'bullish',
      msb?.recommendation === 'avoid' || msb?.market === 'bearish',
      msb ? `${msb.recommendation} · ${msb.market}` : 'n/a',
      msb?.msbScore ?? null
    ),
    utBot: checkStatus(
      'UT Bot',
      utBot?.recommendation === 'buy' || utBot?.position === 'long',
      utBot?.recommendation === 'avoid' || utBot?.position === 'short',
      utBot ? `${utBot.recommendation} · ${utBot.position}` : 'n/a',
      utBot?.utScore ?? null
    ),
    ote: checkStatus(
      'OTE',
      (ote?.inOteZone && ote?.bias === 'bullish') || ote?.recommendation === 'buy',
      ote?.recommendation === 'avoid' || (ote?.inOteZone && ote?.bias === 'bearish'),
      ote?.inOteZone
        ? `In zone · ${ote.bias}`
        : ote?.nearOteZone
          ? 'Near OTE zone'
          : ote?.signals?.[0]?.slice(0, 40) ?? 'n/a',
      ote?.oteScore ?? null
    ),
    wvf: checkStatus(
      'WVF',
      wvf.capitulation || wvf.fearEasing,
      false,
      wvf.capitulation
        ? `Capitulation spike (${wvf.value})`
        : wvf.fearEasing
          ? 'Fear easing after spike'
          : wvf.value != null
            ? `Normal (${wvf.value})`
            : 'n/a',
      wvf.value ?? null
    ),
  };

  const summary = {
    bullish: Object.values(checks).filter((c) => c.status === 'bullish').length,
    bearish: Object.values(checks).filter((c) => c.status === 'bearish').length,
    neutral: Object.values(checks).filter((c) => c.status === 'neutral').length,
    total: INDICATOR_AUDIT_TOTAL,
  };

  const confluence = buildStructureConfluence({
    smcRecommendation: smc?.recommendation,
    smcTrend: smc?.trend,
    smcZone: smc?.zone,
    msbRecommendation: msb?.recommendation,
    msbMarket: msb?.market,
    utBotRecommendation: utBot?.recommendation,
    utBotPosition: utBot?.position,
    utBotSignal: utBot?.signal,
    oteRecommendation: ote?.recommendation,
    oteInZone: ote?.inOteZone,
    oteBias: ote?.bias,
    chartSignals: chartAnalysis.signals ?? [],
  });

  let confirmsMedia = false;
  let primaryReason = '';

  if (recommendation === 'avoid') {
    return {
      checks,
      summary,
      confluence,
      confirmsMedia: false,
      primaryReason: '',
      rejectionReason: 'Chart analysis recommends avoid',
    };
  }

  const dualWithOte = confluence?.dualStructure && checks.ote.status === 'bullish';

  if (recommendation === 'buy') {
    confirmsMedia = true;
    primaryReason = `Strategy buy — ${summary.bullish}/${INDICATOR_AUDIT_TOTAL} indicators bullish`;
  } else if (dualWithOte) {
    confirmsMedia = true;
    primaryReason = 'Dual structure (SMC + MSB) with price in OTE zone';
  } else if (checks.ote.status === 'bullish' && (checks.smc.status === 'bullish' || checks.msb.status === 'bullish')) {
    confirmsMedia = true;
    primaryReason = 'Optimal Trade Entry zone + structure confirmation';
  } else if (checks.smc.status === 'bullish') {
    confirmsMedia = true;
    primaryReason = 'Smart Money Concepts buy / bullish trend';
  } else if (checks.msb.status === 'bullish') {
    confirmsMedia = true;
    primaryReason = 'MSB-OB bullish structure break';
  } else if (checks.utBot.status === 'bullish') {
    confirmsMedia = true;
    primaryReason = 'UT Bot long — above ATR trailing stop';
  } else if (checks.ote.status === 'bullish') {
    confirmsMedia = true;
    primaryReason = 'Price in bullish OTE zone (62–79% Fib)';
  } else if (checks.squeeze.status === 'bullish') {
    confirmsMedia = true;
    primaryReason = 'Squeeze fired with bullish momentum';
  } else if (checks.macd.status === 'bullish' && checks.rsi.status !== 'bearish') {
    confirmsMedia = true;
    primaryReason = 'MACD bullish trend';
  } else if (checks.rsi.status === 'bullish') {
    confirmsMedia = true;
    primaryReason = 'RSI oversold — potential bounce';
  } else if (checks.wvf.status === 'bullish' && countCoreBullishIndicators(checks) >= 3) {
    confirmsMedia = true;
    primaryReason = `WVF capitulation + ${countCoreBullishIndicators(checks)}/7 core indicators bullish`;
  } else if (confluence?.dualStructure) {
    confirmsMedia = true;
    primaryReason = confluence.tripleConfluence
      ? 'Triple confluence (SMC + MSB + UT Bot)'
      : 'Dual structure confluence (SMC + MSB)';
  } else if (summary.bullish >= 3) {
    confirmsMedia = true;
    primaryReason = `${summary.bullish}/${INDICATOR_AUDIT_TOTAL} indicators bullish — multi-signal confirmation`;
  }

  const rejectionReason = confirmsMedia
    ? ''
    : `Only ${summary.bullish}/${INDICATOR_AUDIT_TOTAL} indicators bullish — need OTE, SMC, MSB, UT Bot, or dual structure`;

  return { checks, summary, confluence, confirmsMedia, primaryReason, rejectionReason };
}
