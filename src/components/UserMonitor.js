'use client';

import { useWatcher, WATCHERS } from '@/lib/watcher';

// Header widget: two toggle buttons (User A / User B) that mark who is watching
// the portfolio. The active toggle is highlighted, and a small indicator shows
// which user is currently watching. Click the active user again to clear it.
export default function UserMonitor({ className = '' }) {
  const { watcher, toggle } = useWatcher();
  const active = WATCHERS.find((w) => w.id === watcher);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Toggle buttons */}
      <div className="flex items-center rounded-lg border border-gray-700 bg-gray-900/60 p-0.5">
        {WATCHERS.map((w) => {
          const on = watcher === w.id;
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

      {/* Watching indicator */}
      {active ? (
        <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-green-500/15 text-green-300 border border-green-500/40">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
          </span>
          👁 Watching: {active.label}
        </span>
      ) : (
        <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-gray-700/40 text-gray-400 border border-gray-600/50">
          <span className="h-2 w-2 rounded-full bg-gray-500" />
          No watcher
        </span>
      )}
    </div>
  );
}
