'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Which users are currently "watching" the portfolio. This is SERVER-SHARED
// (Redis via /api/watcher) so toggling User A/B on one system reflects on every
// other system within the poll interval. Any combination is allowed: nobody,
// just A, just B, or both.
const EVENT = 'portfolio-watcher-change';
const POLL_MS = 3000; // sync across systems within ~3 seconds

export const WATCHERS = [
  { id: 'A', label: 'User A' },
  { id: 'B', label: 'User B' },
];

const VALID = new Set(WATCHERS.map((w) => w.id));

function canonical(list) {
  const arr = Array.isArray(list) ? list.map(String) : [];
  return WATCHERS.map((w) => w.id).filter((id) => arr.includes(id) && VALID.has(id));
}

function sameSet(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

async function fetchWatchers() {
  const res = await fetch('/api/watcher', { cache: 'no-store' });
  const json = await res.json();
  return canonical(json?.watchers);
}

async function saveWatchers(ids) {
  const res = await fetch('/api/watcher', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ watchers: canonical(ids) }),
  });
  const json = await res.json();
  return canonical(json?.watchers);
}

/**
 * useWatcher — read + toggle which users are watching the portfolio, synced
 * across all systems via the server. Polls every 3s so another system's change
 * shows up here within ~3 seconds.
 *
 * Returns:
 *   watchers  — array of active ids, e.g. [], ['A'], ['A','B']
 *   isOn(id)  — whether a given user is watching
 *   toggle(id)— flip a single user on/off (persists to the server)
 *   setWatchers(ids) — set the full list explicitly
 */
export function useWatcher() {
  const [watchers, setWatchersState] = useState([]);
  const watchersRef = useRef([]);
  watchersRef.current = watchers;

  // Poll the server so changes made on other systems sync in within POLL_MS.
  useEffect(() => {
    let stopped = false;

    const sync = async () => {
      try {
        const next = await fetchWatchers();
        if (!stopped && !sameSet(next, watchersRef.current)) {
          setWatchersState(next);
        }
      } catch { /* ignore transient network errors */ }
    };

    sync(); // immediate first load
    const interval = setInterval(sync, POLL_MS);

    // Also refresh on same-tab toggles and when the tab regains focus.
    const onLocal = () => sync();
    window.addEventListener(EVENT, onLocal);
    window.addEventListener('focus', onLocal);

    return () => {
      stopped = true;
      clearInterval(interval);
      window.removeEventListener(EVENT, onLocal);
      window.removeEventListener('focus', onLocal);
    };
  }, []);

  const setWatchers = useCallback(async (ids) => {
    const optimistic = canonical(ids);
    setWatchersState(optimistic); // instant local feedback
    try {
      const saved = await saveWatchers(optimistic);
      setWatchersState(saved);
    } catch { /* keep optimistic value; next poll reconciles */ }
    try { window.dispatchEvent(new Event(EVENT)); } catch { /* ignore */ }
  }, []);

  const toggle = useCallback((id) => {
    if (!VALID.has(id)) return;
    const current = watchersRef.current;
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    setWatchers(next);
  }, [setWatchers]);

  const isOn = useCallback((id) => watchers.includes(id), [watchers]);

  return { watchers, isOn, toggle, setWatchers };
}
