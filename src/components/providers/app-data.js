'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AppDataContext = createContext(null);

const CONFIG_REFRESH_MS = 60_000;

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Admin config + portfolio settings + compound goal state. The server layout
 * passes the first two in so the shell renders without a loading flash; they
 * are then refreshed in the background so admin changes reach open tabs.
 */
export function AppDataProvider({ initialConfig, initialSettings, children }) {
  const [config, setConfig] = useState(initialConfig);
  const [settings, setSettings] = useState(initialSettings);
  const [compound, setCompound] = useState(null);

  const reload = useCallback(async () => {
    const [c, s] = await Promise.allSettled([getJson('/api/config'), getJson('/api/settings')]);
    if (c.status === 'fulfilled') setConfig(c.value);
    if (s.status === 'fulfilled') setSettings(s.value);
  }, []);

  const reloadCompound = useCallback(async () => {
    try {
      setCompound(await getJson('/api/compound'));
    } catch { /* keep the previous value */ }
  }, []);

  const saveCompound = useCallback(async (next) => {
    setCompound((prev) => ({ ...prev, ...next }));
    const res = await fetch('/api/compound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (!res.ok) throw new Error('Could not save goal progress');
    const json = await res.json();
    setCompound(json.data);
    return json.data;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of client-only data
    reloadCompound();
    const id = setInterval(reload, CONFIG_REFRESH_MS);
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [reload, reloadCompound]);

  const value = useMemo(
    () => ({ config, settings, compound, reload, reloadCompound, saveCompound }),
    [config, settings, compound, reload, reloadCompound, saveCompound],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider');
  return ctx;
}

export const useAppConfig = () => useAppData().config;
export const usePortfolioSettings = () => useAppData().settings;
