'use client';

import { useState, useEffect, useCallback } from 'react';

// Which of the two users is currently "watching" the portfolio. This is a
// lightweight, client-side monitor indicator (persisted per browser) — it marks
// who is keeping an eye on the dashboard. Values: 'A', 'B', or null (nobody).
const STORAGE_KEY = 'portfolioWatcher';
const EVENT = 'portfolio-watcher-change';

export const WATCHERS = [
  { id: 'A', label: 'User A' },
  { id: 'B', label: 'User B' },
];

function read() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'A' || v === 'B' ? v : null;
  } catch {
    return null;
  }
}

/**
 * useWatcher — read + toggle which user is watching the portfolio.
 * Enabling a user disables the other (only one watcher at a time); clicking the
 * active user again clears it (nobody watching). Syncs across components/tabs.
 */
export function useWatcher() {
  // Start as null so server and first client render match (no hydration
  // mismatch); sync from localStorage right after mount via the subscription.
  const [watcher, setWatcherState] = useState(null);

  useEffect(() => {
    const onChange = () => setWatcherState(read());
    onChange(); // initial sync from localStorage after mount
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const setWatcher = useCallback((id) => {
    const next = id === 'A' || id === 'B' ? id : null;
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore storage errors */ }
    setWatcherState(next);
    try { window.dispatchEvent(new Event(EVENT)); } catch { /* ignore */ }
  }, []);

  // Toggle: enabling an inactive user switches to them; clicking the active one clears it.
  const toggle = useCallback((id) => {
    setWatcher(read() === id ? null : id);
  }, [setWatcher]);

  return { watcher, setWatcher, toggle };
}
