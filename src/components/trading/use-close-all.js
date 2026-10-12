'use client';

import { useCallback, useState } from 'react';
import { useConfirm } from '@/components/ui';
import { useNotify } from '@/lib/notify';

const MODES = {
  standard: {
    title: 'Close all positions?',
    description: 'Every open position below 20x leverage is closed at market. Positions at 20x or higher are kept.',
    confirmLabel: 'Close positions',
    done: 'Positions closed',
  },
  zero: {
    title: 'Close everything?',
    description: 'Every open position is closed at market, including 20x and above. Nothing is kept.',
    confirmLabel: 'Close everything',
    done: 'All positions closed',
  },
};

async function postCloseAll(includeHuge) {
  const res = await fetch('/api/futures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'closeAll', includeHuge }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Close request failed');
  return json.data || {};
}

/**
 * Close-all with confirmation and a result toast. `mode` is 'standard'
 * (keeps 20x+) or 'zero' (closes everything). Pass `{ confirm: false }` for
 * automated triggers such as the circuit breaker.
 */
export function useCloseAll({ onDone } = {}) {
  const confirm = useConfirm();
  const { notify } = useNotify();
  const [busy, setBusy] = useState(null);

  const run = useCallback(
    async (mode = 'standard', { confirm: ask = true, reason } = {}) => {
      const copy = MODES[mode];
      if (ask && !(await confirm({ ...copy, tone: 'danger' }))) return null;

      setBusy(mode);
      try {
        const { closed = 0, skipped = 0, failed = 0 } = await postCloseAll(mode === 'zero');
        const parts = [`${closed} closed`];
        if (mode !== 'zero' && skipped) parts.push(`${skipped} kept (20x+)`);
        if (failed) parts.push(`${failed} failed`);
        notify({
          level: failed ? 'warning' : 'success',
          beep: true,
          sticky: !!reason,
          title: reason || copy.done,
          message: parts.join(' · '),
        });
        onDone?.();
        return { closed, skipped, failed };
      } catch (err) {
        notify({ level: 'danger', beep: true, title: 'Close all failed', message: err.message });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [confirm, notify, onDone],
  );

  return { closeAll: run, busy };
}
