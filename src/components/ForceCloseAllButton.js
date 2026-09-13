'use client';

import { useState } from 'react';
import { useNotify } from '@/lib/notify';

/**
 * Close-all button. Two modes:
 *  - default: "Force Close All" — closes positions EXCEPT leverage >= 20x.
 *  - zero:    "Zero Order Close" — closes EVERYTHING, including 20x+.
 *
 * Props:
 *  - zero?: boolean        → include huge (20x+) positions, "close everything"
 *  - onDone?: () => void   → called after a successful close (refresh / close menu)
 *  - className?: string
 *  - compact?: boolean     → smaller styling for the side menu
 */
export default function ForceCloseAllButton({ zero = false, onDone, className = '', compact = false }) {
  const { notify } = useNotify();
  const [busy, setBusy] = useState(false);

  const label = zero ? '🧨 Zero Order Close' : '⛔ Force Close All';
  const confirmMsg = zero
    ? 'ZERO ORDER CLOSE — close EVERYTHING, including 20x+ positions?\n\nThis exits every open position with no exceptions.'
    : 'Force close ALL open positions?\n\nPositions at 20x or higher leverage are NOT closed (huge-order exception).';

  const handleClick = async () => {
    if (busy) return;
    if (!confirm(confirmMsg)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/futures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'closeAll', includeHuge: zero }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to close');

      const { closed = 0, skipped = 0, failed = 0 } = json.data || {};
      notify({
        level: failed > 0 ? 'warning' : 'success',
        beep: true,
        title: zero ? 'Zero Order Close' : 'Force Close All',
        message: `Closed ${closed}${zero ? '' : ` · skipped ${skipped} (20x+)`}${failed ? ` · failed ${failed}` : ''}`.trim(),
      });
      if (onDone) onDone();
    } catch (err) {
      notify({ level: 'danger', beep: true, title: `${label} failed`, message: err.message });
    } finally {
      setBusy(false);
    }
  };

  const base = compact
    ? 'w-full px-3 py-2.5 text-sm font-semibold rounded-lg'
    : 'px-4 py-2 text-sm font-semibold rounded-lg';
  const color = zero
    ? 'bg-red-800 hover:bg-red-700 border border-red-500/60'
    : 'bg-red-600 hover:bg-red-500';

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={`${base} ${color} disabled:opacity-50 text-white transition-colors ${className}`}
      title={zero ? 'Close everything, including 20x+' : 'Close all open positions (except 20x+)'}
    >
      {busy ? 'Closing…' : label}
    </button>
  );
}
