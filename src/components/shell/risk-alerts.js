'use client';

import { useEffect, useRef, useState } from 'react';
import { useNotify } from '@/lib/notify';
import { usd, percent } from '@/lib/format';
import { useFuturesStream } from '@/components/providers/futures-stream';
import { usePortfolioSettings } from '@/components/providers/app-data';
import { useCloseAll } from '@/components/trading/use-close-all';

/**
 * Calls `onRise` once each time `active` turns true; re-arms when it turns
 * false again. Keeps alerts from repeating on every price tick.
 */
function useEdge(active, onRise, onFall) {
  const latched = useRef(false);
  const handlers = useRef({ onRise, onFall });
  useEffect(() => {
    handlers.current = { onRise, onFall };
  });
  useEffect(() => {
    if (active && !latched.current) {
      latched.current = true;
      handlers.current.onRise?.();
    } else if (!active && latched.current) {
      latched.current = false;
      handlers.current.onFall?.();
    }
  }, [active]);
}

/** True only once `value` has stayed true for `delay` ms; false immediately. */
function useSustained(value, delay) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), value ? delay : 0);
    return () => clearTimeout(id);
  }, [value, delay]);
  return value && settled;
}

/** Headless: raises toasts and alarms for risk events on every page. */
export function RiskAlerts() {
  const { notify } = useNotify();
  const settings = usePortfolioSettings();
  const { positions, dailyRisk: r, wsConnected, loaded, refetch } = useFuturesStream();
  const { closeAll } = useCloseAll({ onDone: refetch });

  const maxOpen = Number(settings.maxOpenPositions) || 0;
  const openCount = positions.length;

  useEdge(r.wallet > 0 && r.alarmTripped && !r.breakerTripped, () =>
    notify({
      level: 'danger',
      beep: true,
      sticky: true,
      title: `Daily loss alarm: ${percent(r.realizedLossPctOfWallet, { decimals: 1 })} of wallet`,
      message: `Realized loss today is ${usd(r.realizedLoss)}. New entries are blocked at ${r.limitPercent}% (${usd(r.limitUsd)}).`,
    }),
  );

  useEdge(r.breakerTripped, () => {
    notify({
      level: 'danger',
      beep: true,
      sticky: true,
      title: 'Circuit breaker tripped',
      message: `Realized loss of ${usd(r.realizedLoss)} reached the ${r.limitPercent}% daily limit. New entries under 20x are blocked until tomorrow (UTC).`,
    });
    if (Number(settings.autoCloseOnBreaker) === 1) {
      closeAll('standard', { confirm: false, reason: 'Auto-closed: daily loss limit' });
    }
  });

  useEdge(maxOpen > 0 && openCount > maxOpen, () =>
    notify({
      level: 'warning',
      beep: true,
      title: 'Too many open positions',
      message: `${openCount} open against a limit of ${maxOpen}.`,
    }),
  );

  const feedDown = useSustained(loaded && openCount > 0 && !wsConnected, 8000);
  useEdge(
    feedDown,
    () => notify({ level: 'warning', title: 'Price feed disconnected', message: 'PnL may lag while it reconnects.' }),
    () => notify({ level: 'success', title: 'Price feed reconnected' }),
  );

  return null;
}
