'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY as STORAGE_KEY } from '@/lib/theme-script';

export const THEME_PREFERENCES = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'system', label: 'System' },
];

const THEME_EVENT = 'app-theme-change';

function readPreference() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || 'dark';
    if (raw === 'light' || raw === 'paper') return 'light';
    if (raw === 'system') return 'system';
    return 'dark';
  } catch {
    return 'dark';
  }
}

function resolve(preference) {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function subscribePreference(callback) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function subscribeResolved(callback) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/** The palette currently painted ('dark' | 'light'); follows every change. */
export function useResolvedTheme() {
  return useSyncExternalStore(
    subscribeResolved,
    () => document.documentElement.getAttribute('data-theme') || 'dark',
    () => 'dark',
  );
}

export function useTheme() {
  const preference = useSyncExternalStore(subscribePreference, readPreference, () => 'dark');
  const resolved = useResolvedTheme();

  useEffect(() => {
    if (preference !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => document.documentElement.setAttribute('data-theme', resolve('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch { /* storage unavailable */ }
    document.documentElement.setAttribute('data-theme', resolve(next));
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return { preference, resolved, setPreference };
}
