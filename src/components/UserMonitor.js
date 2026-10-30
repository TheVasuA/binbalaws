'use client';

import { useWatcher, WATCHERS } from '@/lib/watcher';

// Header widget: two independent toggle buttons (User A / User B) that mark who
// is watching the portfolio. Both can be on at once. The active button is
// highlighted green; no separate indicator — the buttons are the indicator.
export default function UserMonitor({ className = '' }) {
  const { isOn, toggle } = useWatcher();

  return (
    <div className={`flex items-center rounded-lg border border-gray-700 bg-gray-900/60 p-0.5 ${className}`}>
      {WATCHERS.map((w) => {
        const on = isOn(w.id);
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => toggle(w.id)}
            aria-pressed={on}
            title={on ? `${w.label} is watching — click to stop` : `Set ${w.label} as watcher`}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              on
                ? 'bg-green-600 text-white shadow'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/60'
            }`}
          >
            {w.label}
          </button>
        );
      })}
    </div>
  );
}
