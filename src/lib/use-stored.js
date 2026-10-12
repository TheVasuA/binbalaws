'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

const EVENT = 'app-local-store';

function subscribe(callback) {
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function readRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota or private mode */ }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * JSON value persisted in localStorage, shared by every component using the
 * same key and kept in sync across tabs. Server render sees `fallback`.
 */
export function useStored(key, fallback) {
  const raw = useSyncExternalStore(subscribe, () => readRaw(key), () => null);
  const value = useMemo(() => {
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
    // `fallback` is a literal at call sites; only the stored string matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);
  const set = useCallback((next) => writeStored(key, next), [key]);
  return [value, set];
}
