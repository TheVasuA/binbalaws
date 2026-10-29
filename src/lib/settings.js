'use client';

import { useState, useEffect, useCallback } from 'react';

// Default portfolio settings — must stay in sync with the API route DEFAULTS.
export const DEFAULT_SETTINGS = {
  goalTarget: 25000,      // USD target for the compound goal
  compoundPercent: 2,      // % gain aimed per trade
  defaultLeverage: 15,     // leverage pre-filled on new orders
  inrRate: 100,            // USD → INR multiplier used for PnL display
  maxLeverageWarn: 20,       // flag positions with leverage >= this
  riskPerTradePercent: 2,    // % of wallet risked per trade
  maxOpenPositions: 3,       // max concurrent positions before a danger badge shows
  orderAlertMinutes: 15,     // new-order alarm stays active this many minutes
  orderAlertBeep: 1,         // 1 = beep when a new order is placed
  maxOpenOrders: 5,          // max concurrent orders before a warning is shown
  dailyLossLimitPercent: 10, // circuit breaker: block new orders at this daily loss %
  alarmLossPercent: 8,       // beep + alert when daily loss reaches this % of margin
  autoCloseOnBreaker: 0,     // 1 = auto-close all (except >=20x) when limit hit
  allowOrdersAfterBreach: 0, // 1 = allow new orders even after daily limit breached
  baseBalance: 0,           // base balance protection target (close all when overall reaches this)
  baseBalanceAlarmPercent: 10, // alarm at this % before base balance
  baseBalanceAutoClose: 1,   // 1 = auto-close all when base balance reached
  baseBalanceProfitPercent: 10, // today profit % added to base balance next day
};

// The settings API rejects writes without a valid unlock session token. The
// token is issued by /api/settings-auth on verify and stashed in sessionStorage
// (per browser session) by the Settings page on unlock.
function getSettingsToken() {
  try { return sessionStorage.getItem('settingsToken') || ''; } catch { return ''; }
}

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
      const token = getSettingsToken();
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'x-settings-token': token } : {}) },
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
      const token = getSettingsToken();
      const res = await fetch('/api/settings', {
        method: 'DELETE',
        headers: token ? { 'x-settings-token': token } : {},
      });
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
