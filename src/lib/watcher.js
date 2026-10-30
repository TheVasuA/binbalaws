'use client';

import { useState, useEffect, useCallback } from 'react';

// Which users are currently "watching" the portfolio. This is a lightweight,
// client-side monitor indicator (persisted per browser) — it marks who is
// keeping an eye on the dashboard. Any combination is allowed: nobody, just A,
// just B, or both. Stored as a comma-joined list of ids, e.g. "A,B".
const STORAGE_KEY = 'portfolioWatchers';
const EVENT = 'portfolio-watcher-change';

export const WATCHERS = [
  { id: 'A', label: 'User A' },
  { id: 'B', label: 'User B' },
];

const VALID = new Set(WATCHERS.map((w) => w.id));

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || '';
    return raw.split(',').map((s) => s.trim()).filter((s) => VALID.has(s));
  } catch {
    return [];
  }
}

function write(ids) {
  // Keep canonical order (A before B) and dedupe.
  const ordered = WATCHERS.map((w) => w.id).filter((id) => ids.includes(id));
  try {
    if (ordered.length) localStorage.setItem(STORAGE_KEY, ordered.join(','));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore storage errors */ }
  return ordered;
}

/**
 * useWatcher — read + toggle which users are watching the portfolio.
 * Each user toggles independently, so both can watch at once. Syncs across
 * components and browser tabs.
 *
 * Returns:
 *   watchers  — array of active ids, e.g. [], ['A'], ['A','B']
 *   isOn(id)  — whether a given user is watching
 *   toggle(id)— flip a single user on/off
 *   setWatchers(ids) — set the full list explicitly
 */
export function useWatcher() {
  // Start empty so server and first client render match (no hydration
  // mismatch); sync from localStorage right after mount via the subscription.
  const [watchers, setWatchersState] = useState([]);

  useEffect(() => {
    const onChange = () => setWatchersState(read());
    onChange(); // initial sync from localStorage after mount
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const setWatchers = useCallback((ids) => {
    const next = write(Array.isArray(ids) ? ids : []);
    setWatchersState(next);
    try { window.dispatchEvent(new Event(EVENT)); } catch { /* ignore */ }
  }, []);

  const toggle = useCallback((id) => {
    if (!VALID.has(id)) return;
    const current = read();
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    setWatchers(next);
  }, [setWatchers]);

  const isOn = useCallback((id) => watchers.includes(id), [watchers]);

  return { watchers, isOn, toggle, setWatchers };
}
