'use client';
import { useEffect, useState } from 'react';
import { formatCurrency, formatPercent } from '@/lib/utils';

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

// Fetch RSI via our own server-side API (cached, no direct Binance calls from browser)
function useRSI(symbol, interval) {
  const [rsi, setRsi] = useState(null);
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/rsi?symbol=${symbol}&interval=${interval}`);
        const data = await res.json();
        if (data.rsi !== undefined) setRsi(data.rsi);
      } catch { /* ignore */ }
    }
    load();
    // Refresh every 5 minutes – RSI doesn't need per-minute updates
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [symbol, interval]);
  return rsi;
}

function RSIGauge({ symbol, interval, label }) {
  const rsi = useRSI(symbol, interval);

  const size = 90;
  const cx = size / 2;
  const cy = size / 2;
  const r = 32;
  const strokeWidth = 8;

  const toRad = (deg) => (deg * Math.PI) / 180;

  const polarToXY = (angleDeg, radius) => ({
    x: cx + radius * Math.cos(toRad(angleDeg)),
    y: cy + radius * Math.sin(toRad(angleDeg)),
  });

  const arcPath = (startDeg, endDeg) => {
    const s = polarToXY(startDeg, r);
    const e = polarToXY(endDeg, r);
    const largeArc = Math.abs(endDeg - startDeg) >= 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  };

  // Semicircle: left (-180°) to right (0°) sweeping through top
  const ARC_START = -180;
  const ARC_END = 0;

  const rsiVal = (rsi !== null && !isNaN(rsi)) ? Math.min(100, Math.max(0, rsi)) : null;
  const fillEndAngle = rsiVal !== null ? ARC_START + (rsiVal / 100) * 180 : ARC_START;

  // Needle goes from center outward at the rsi angle
  const needleAngle = rsiVal !== null ? ARC_START + (rsiVal / 100) * 180 : ARC_START;
  const needleTip = polarToXY(needleAngle, r - 5);
  const needleBase1 = polarToXY(needleAngle + 90, 4);
  const needleBase2 = polarToXY(needleAngle - 90, 4);

  const trackColor = '#374151';
  const fillColor = rsiVal === null ? '#6b7280'
    : rsiVal >= 70 ? '#ef4444'
    : rsiVal <= 30 ? '#22c55e'
    : '#eab308';

  const zone = rsiVal === null ? '–'
    : rsiVal >= 70 ? 'Overbought'
    : rsiVal <= 30 ? 'Oversold'
    : 'Neutral';

  const textColor = rsiVal === null ? 'text-gray-400'
    : rsiVal >= 70 ? 'text-red-500'
    : rsiVal <= 30 ? 'text-green-400'
    : 'text-yellow-400';

  const svgH = size / 2 + 12;

  return (
    <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700 flex flex-col items-center">
      <p className="text-gray-400 text-xs mb-1">BTC RSI {label}</p>
      <svg width={size} height={svgH} viewBox={`0 0 ${size} ${svgH}`}>
        {/* Background track */}
        <path d={arcPath(ARC_START, ARC_END)} fill="none" stroke={trackColor} strokeWidth={strokeWidth} strokeLinecap="round" />
        {/* Oversold zone band (0–30) */}
        <path d={arcPath(ARC_START, ARC_START + 0.3 * 180)} fill="none" stroke="#22c55e" strokeWidth={strokeWidth} opacity="0.3" strokeLinecap="round" />
        {/* Overbought zone band (70–100) */}
        <path d={arcPath(ARC_START + 0.7 * 180, ARC_END)} fill="none" stroke="#ef4444" strokeWidth={strokeWidth} opacity="0.3" strokeLinecap="round" />
        {/* Filled value arc */}
        {rsiVal !== null && rsiVal > 0 && (
          <path d={arcPath(ARC_START, fillEndAngle)} fill="none" stroke={fillColor} strokeWidth={strokeWidth} strokeLinecap="round" />
        )}
        {/* Needle triangle */}
        {rsiVal !== null && (
          <polygon
            points={`${needleTip.x.toFixed(2)},${needleTip.y.toFixed(2)} ${needleBase1.x.toFixed(2)},${needleBase1.y.toFixed(2)} ${needleBase2.x.toFixed(2)},${needleBase2.y.toFixed(2)}`}
            fill="white"
            opacity="0.9"
          />
        )}
        <circle cx={cx} cy={cy} r="3.5" fill="#1f2937" stroke="white" strokeWidth="1.5" />
        {/* Tick marks at 30 and 70 */}
        {[30, 70].map(v => {
          const angle = ARC_START + (v / 100) * 180;
          const inner = polarToXY(angle, r - strokeWidth / 2 - 2);
          const outer = polarToXY(angle, r + strokeWidth / 2 + 3);
          return (
            <line key={v}
              x1={inner.x.toFixed(2)} y1={inner.y.toFixed(2)}
              x2={outer.x.toFixed(2)} y2={outer.y.toFixed(2)}
              stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.8"
            />
          );
        })}
        {/* Labels */}
        <text x="3" y={svgH - 2} fontSize="7" fill="#6b7280">0</text>
        <text x={size - 12} y={svgH - 2} fontSize="7" fill="#6b7280">100</text>
        <text x={cx - 4} y="11" fontSize="7" fill="#6b7280">50</text>
      </svg>
      <p className={`text-sm font-bold -mt-0.5 ${textColor}`}>{rsiVal !== null ? Math.round(rsiVal) : '…'}</p>
      <p className="text-gray-500 text-xs mt-0.5">{zone}</p>
    </div>
  );
}


export default function FuturesRiskMetrics({ metrics, account, positions }) {
  // Target value for achievement
  const TARGET_VALUE = 100000;
  const targetAchieved = (account?.totalWalletBalance || 0) >= TARGET_VALUE;
  const finalValue = account?.totalWalletBalance || 0;
  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        No futures data available
      </div>
    );
  }

  // Calculate total potential loss if all stop losses hit
  const totalStopLossValue = positions?.reduce((sum, p) => {
    if (p.stopLossValue && p.stopLossValue < 0) {
      return sum + p.stopLossValue;
    }
    return sum;
  }, 0) || 0;

  // Remaining balance if all SL hit
  const balanceAfterSL = (account?.totalWalletBalance || 0) + totalStopLossValue;

  const getRiskColor = (level) => {
    switch (level) {
      case 'Very High': return 'text-red-500 bg-red-500/10';
      case 'High': return 'text-orange-500 bg-orange-500/10';
      case 'Medium': return 'text-yellow-500 bg-yellow-500/10';
      case 'Low': return 'text-green-500 bg-green-500/10';
      default: return 'text-gray-500 bg-gray-500/10';
    }
  };

  const metricCards = [
    // Target achievement card
    ...(targetAchieved ? [{
      label: '🎯 Target Achieved',
      value: formatCurrency(Math.round(finalValue), 0),
      subValue: `Final Value`,
      color: 'text-green-500',
    }] : []),
    {
      label: 'Unrealized PnL',
      value: formatCurrency(Math.round(parseFloat(metrics.totalPnL)), 0),
      subValue: `${Math.round(metrics.totalPnLPercent)}%`,
      color: parseFloat(metrics.totalPnL) >= 0 ? 'text-green-500' : 'text-red-500',
    },
    {
      label: 'Wallet Balance',
      value: formatCurrency(Math.round(account?.totalWalletBalance || 0), 0),
      subValue: `Available: ${formatCurrency(Math.round(account?.availableBalance || 0), 0)}`,
      color: 'text-blue-500',
    },
    {
      label: 'If All SL Hit',
      value: formatCurrency(Math.round(balanceAfterSL), 0),
      subValue: `Loss: ${formatCurrency(Math.round(totalStopLossValue), 0)}`,
      color: balanceAfterSL > 0 ? 'text-yellow-500' : 'text-red-500',
    },
    {
      label: 'Maint. Margin',
      value: formatCurrency(Math.round(account?.totalMaintMargin || 0), 0),
      subValue: account?.totalMarginBalance
        ? `${((account.totalMaintMargin / account.totalMarginBalance) * 100).toFixed(1)}% of balance`
        : 'Liquidation buffer',
      color: account?.totalMaintMargin / account?.totalMarginBalance > 0.5
        ? 'text-red-500'
        : account?.totalMaintMargin / account?.totalMarginBalance > 0.25
          ? 'text-yellow-500'
          : 'text-green-500',
    },
    {
      label: 'Open Positions',
      value: Math.round(metrics.positionCount),
      subValue: `USDT: ${formatCurrency(Math.round(parseFloat(metrics.totalNotional)), 0)}`,
      color: 'text-purple-500',
    },
    {
      label: 'Long',
      value: formatCurrency(Math.round(parseFloat(metrics.longExposure)), 0),
      subValue: 'USDT Long',
      color: 'text-green-500',
    },
    {
      label: 'Short',
      value: formatCurrency(Math.round(parseFloat(metrics.shortExposure)), 0),
      subValue: 'USDT Short',
      color: 'text-red-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-9 gap-3 md:gap-4">
      {metricCards.map((metric, index) => (
        <div key={index} className="bg-gray-800/50 rounded-xl p-3 md:p-4 border border-gray-700">
          <p className="text-gray-400 text-xs mb-1">{metric.label}</p>
          <p className={`text-base md:text-lg font-bold ${metric.isRisk ? getRiskColor(metric.value).split(' ')[0] : metric.color}`}>
            {metric.value}
          </p>
          <p className="text-gray-500 text-xs mt-1 truncate">{metric.subValue}</p>
        </div>
      ))}
      <RSIGauge symbol="BTCUSDT" interval="1h" label="1H" />
      <RSIGauge symbol="BTCUSDT" interval="4h" label="4H" />
    </div>
  );
}
