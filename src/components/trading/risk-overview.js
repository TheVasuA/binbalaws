'use client';

import { useEffect, useState } from 'react';
import { Badge, Card, CardHeader, Progress } from '@/components/ui';
import { positionMetrics } from '@/lib/futures-client';
import { compactUsd, percent, signedUsd, usd, TONE_TEXT, toneOf } from '@/lib/format';
import { cn } from '@/lib/cn';

function Meter({ label, value, detail, tone, pct, align }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-fg-muted">{label}</span>
        <span className={cn('num font-medium', TONE_TEXT[tone] || 'text-fg')}>{value}</span>
      </div>
      <Progress value={pct} tone={tone === 'default' ? 'accent' : tone} align={align} />
      {detail && <p className="num mt-1.5 text-xs text-fg-subtle">{detail}</p>}
    </div>
  );
}

/** Today's target and loss-limit bars. */
export function DailyLimits({ risk }) {
  const lossTone = risk.breakerTripped ? 'neg' : risk.lossUsedPct >= 70 ? 'warn' : 'muted';
  return (
    <Card>
      <CardHeader
        title="Today"
        description="Resets at 00:00 UTC"
        actions={
          risk.breakerTripped ? (
            <Badge tone="neg" dot>Breaker tripped</Badge>
          ) : risk.breakerNear ? (
            <Badge tone="warn" dot>Near limit</Badge>
          ) : risk.targetHit ? (
            <Badge tone="pos" dot>Target reached</Badge>
          ) : null
        }
      />
      <div className="grid gap-5 p-4 sm:grid-cols-2">
        <Meter
          label={`Target · ${risk.targetPercent}% of wallet`}
          value={`${usd(risk.liveProfit)} / ${usd(risk.targetUsd)}`}
          detail={`${risk.targetPct.toFixed(0)}% reached`}
          tone={risk.targetHit ? 'pos' : 'default'}
          pct={risk.targetPct}
        />
        <Meter
          label={`Loss limit · ${risk.limitPercent}% of wallet`}
          value={`${usd(risk.liveLoss)} / ${usd(risk.limitUsd)}`}
          detail={
            risk.breakerTripped
              ? 'New entries under 20x are blocked until 00:00 UTC'
              : `Realized ${signedUsd(risk.realized)} · alarm at ${risk.alarmPercent}%`
          }
          tone={lossTone}
          pct={risk.lossUsedPct}
        />
      </div>
    </Card>
  );
}

function computeExposure(positions, account) {
  let long = 0;
  let short = 0;
  let stopLoss = 0;
  let unprotected = 0;
  let maxLev = 0;
  for (const p of positions) {
    const m = positionMetrics(p);
    if (p.side === 'LONG') long += m.notional;
    else short += m.notional;
    maxLev = Math.max(maxLev, m.leverage);
    if (p.stopLossPrice) stopLoss += Math.min(0, Number(p.stopLossValue) || 0);
    else unprotected += 1;
  }
  const wallet = Number(account?.totalWalletBalance) || 0;
  const marginBalance = Number(account?.totalMarginBalance) || wallet;
  const maint = Number(account?.totalMaintMargin) || 0;
  const initial = Number(account?.totalPositionInitialMargin) || 0;
  return {
    long,
    short,
    total: long + short,
    maxLev,
    stopLoss,
    unprotected,
    afterStops: wallet + stopLoss,
    marginUsage: marginBalance > 0 ? (initial / marginBalance) * 100 : 0,
    maintRatio: marginBalance > 0 ? (maint / marginBalance) * 100 : 0,
  };
}

function Figure({ label, value, sub, tone }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className={cn('num mt-1 truncate text-[15px] font-semibold', TONE_TEXT[tone] || 'text-fg')}>{value}</p>
      {sub && <p className="num mt-0.5 truncate text-xs text-fg-subtle">{sub}</p>}
    </div>
  );
}

export function ExposurePanel({ positions, account, maxOpen }) {
  const e = computeExposure(positions, account);
  const longPct = e.total > 0 ? (e.long / e.total) * 100 : 50;
  const marginTone = e.maintRatio > 50 ? 'neg' : e.maintRatio > 25 ? 'warn' : 'default';

  return (
    <Card>
      <CardHeader
        title="Exposure"
        description={`${positions.length} open${maxOpen ? ` of ${maxOpen} allowed` : ''}`}
        actions={positions.length > maxOpen && maxOpen > 0 ? <Badge tone="neg" dot>Over limit</Badge> : null}
      />
      <div className="space-y-5 p-4">
        <div>
          <div className="num mb-1.5 flex justify-between text-xs">
            <span className="text-pos">Long {compactUsd(e.long)}</span>
            <span className="text-neg">Short {compactUsd(e.short)}</span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-3">
            {e.total > 0 && (
              <>
                <div className="h-full bg-pos" style={{ width: `${longPct}%` }} />
                <div className="h-full bg-neg" style={{ width: `${100 - longPct}%` }} />
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          <Figure label="Notional" value={compactUsd(e.total)} sub={e.maxLev ? `Max ${e.maxLev}x` : 'No positions'} />
          <Figure
            label="Margin in use"
            value={percent(e.marginUsage, { decimals: 1 })}
            sub={`Maint. ${percent(e.maintRatio, { decimals: 1 })}`}
            tone={marginTone}
          />
          <Figure
            label="If every stop hits"
            value={usd(e.afterStops, 0)}
            sub={e.stopLoss ? signedUsd(e.stopLoss, 0) : 'No stop losses set'}
            tone={toneOf(e.stopLoss) === 'neg' ? 'warn' : 'default'}
          />
          <Figure
            label="Without a stop"
            value={e.unprotected}
            sub={e.unprotected ? 'Unlimited downside' : 'All protected'}
            tone={e.unprotected ? 'neg' : 'pos'}
          />
        </div>
      </div>
    </Card>
  );
}

function useRsi(symbol, interval) {
  const [rsi, setRsi] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/rsi?symbol=${symbol}&interval=${interval}`);
        const data = await res.json();
        if (alive && Number.isFinite(data.rsi)) setRsi(data.rsi);
      } catch { /* keep previous */ }
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [symbol, interval]);
  return rsi;
}

function RsiRow({ symbol, interval, label }) {
  const rsi = useRsi(symbol, interval);
  const zone = rsi === null ? null : rsi >= 70 ? 'Overbought' : rsi <= 30 ? 'Oversold' : 'Neutral';
  const tone = rsi === null ? 'muted' : rsi >= 70 ? 'neg' : rsi <= 30 ? 'pos' : 'default';
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-fg-muted">{label}</span>
        <span className="num">
          <span className={cn('font-semibold', TONE_TEXT[tone])}>{rsi === null ? '—' : rsi.toFixed(1)}</span>
          {zone && <span className="ml-1.5 text-fg-subtle">{zone}</span>}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-surface-3">
        <div className="absolute inset-y-0 left-0 w-[30%] rounded-l-full bg-pos/25" />
        <div className="absolute inset-y-0 right-0 w-[30%] rounded-r-full bg-neg/25" />
        {rsi !== null && (
          <div
            className="absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg"
            style={{ left: `${Math.min(100, Math.max(0, rsi))}%` }}
          />
        )}
      </div>
    </div>
  );
}

export function MarketPulse() {
  return (
    <Card>
      <CardHeader title="BTC momentum" description="RSI 14 on Binance perpetual" />
      <div className="space-y-5 p-4">
        <RsiRow symbol="BTCUSDT" interval="1h" label="1 hour" />
        <RsiRow symbol="BTCUSDT" interval="4h" label="4 hour" />
      </div>
    </Card>
  );
}
