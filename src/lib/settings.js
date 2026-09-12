'use client';

import { useState, useEffect, useCallback } from 'react';

// Default portfolio settings — must stay in sync with the API route DEFAULTS.
export const DEFAULT_SETTINGS = {
  goalTarget: 100000,      // USD target for the compound goal
  compoundPercent: 2,      // % gain aimed per trade
  defaultLeverage: 15,     // leverage pre-filled on new orders
  inrRate: 100,            // USD → INR multiplier used for PnL display
  maxLeverageWarn: 20,       // flag positions with leverage >= this
  riskPerTradePercent: 2,    // % of wallet risked per trade
  maxOpenPositions: 3,       // max concurrent positions before a danger badge shows
  dailyLossLimitPercent: 10, // circuit breaker: block new orders at this daily loss %
  alarmLossPercent: 8,       // beep + alert when daily loss reaches this % of margin
};

/**
 * Load + persist portfolio settings (Redis-backed via /api/settings).
 * Returns the merged settings, a saving flag, and save/reset helpers.
 */
export function usePortfolioSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings({ ...DEFAULT_SETTINGS, ...(data || {}) });
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (next) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to save settings');
      setSettings({ ...DEFAULT_SETTINGS, ...json.data });
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const reset = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', { method: 'DELETE' });
      const json = await res.json();
      setSettings({ ...DEFAULT_SETTINGS, ...(json.data || {}) });
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, loading, saving, error, save, reset, reload: load };
}
