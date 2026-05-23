'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Live Balance — polls Binance account every 10s for wallet/margin/available.
 * Updates lastUpdated timestamp on every poll so the UI can show freshness.
 */
export function useLiveBalance({ enabled = true } = {}) {
  const [balance, setBalance] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchBalance = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch('/api/futures?type=account');
      const json = await res.json();
      if (json.success && json.data) {
        const newBal = {
          wallet: json.data.totalWalletBalance || 0,
          margin: json.data.totalMarginBalance || 0,
          available: json.data.availableBalance || 0,
        };
        // Only update if values actually changed — triggers re-render
        setBalance(newBal);
        setLastUpdated(Date.now());
        setError(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    fetchBalance();
    const id = setInterval(fetchBalance, 10_000);
    return () => clearInterval(id);
  }, [fetchBalance, enabled]);

  return { balance, lastUpdated, loading, error, refetch: fetchBalance };
}
