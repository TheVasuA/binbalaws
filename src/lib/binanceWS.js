'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ── Helpers ────────────────────────────────────────────────────────────────────
function getRiskValue({ side, entryPrice, positionAmt, triggerPrice }) {
  if (!Number.isFinite(triggerPrice)) return null;
  if (side === 'LONG') return (triggerPrice - entryPrice) * positionAmt;
  return (entryPrice - triggerPrice) * positionAmt;
}

function normalizePosition(position) {
  return {
    ...position,
    positionAmt: Number(position.positionAmt || 0),
    entryPrice: Number(position.entryPrice || 0),
    markPrice: Number(position.markPrice || 0),
    unrealizedProfit: Number(position.unrealizedProfit || 0),
    liquidationPrice: Number(position.liquidationPrice || 0),
    leverage: Number(position.leverage || 0),
    isolatedMargin: Number(position.isolatedMargin || 0),
    notionalValue: Number(position.notionalValue || 0),
    roe: Number(position.roe || 0),
  };
}

function calcPnl({ side, positionAmt, entryPrice, markPrice }) {
  if (!Number.isFinite(markPrice) || !Number.isFinite(entryPrice) || !positionAmt) return 0;
  return side === 'LONG'
    ? (markPrice - entryPrice) * positionAmt
    : (entryPrice - markPrice) * positionAmt;
}

function preparePositions(positions = []) {
  return positions.map((p) => {
    const n = normalizePosition(p);
    return {
      ...n,
      unrealizedProfit: calcPnl(n),
      stopLossValue:
        n.stopLossValue ??
        getRiskValue({ side: n.side, entryPrice: n.entryPrice, positionAmt: n.positionAmt, triggerPrice: n.stopLossPrice ?? null }),
      takeProfitValue:
        n.takeProfitValue ??
        getRiskValue({ side: n.side, entryPrice: n.entryPrice, positionAmt: n.positionAmt, triggerPrice: n.takeProfitPrice ?? null }),
    };
  });
}

// ── Constants ──────────────────────────────────────────────────────────────────
const STALE_MESSAGE_TIMEOUT_MS = 60_000;
const PLANNED_RECONNECT_MS = 23 * 60 * 60_000; // Binance closes at 24h
const MAX_RETRIES = 20;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 30_000;
const HANDSHAKE_TIMEOUT_MS = 15_000;

// ─── Futures Stream ────────────────────────────────────────────────────────────
export function useBinanceFuturesStream({ initialData = null } = {}) {
  const [account, setAccount] = useState(() => initialData?.account ?? null);
  const [positions, setPositions] = useState(() => preparePositions(initialData?.positions ?? []));
  const [openOrders, setOpenOrders] = useState(() => initialData?.openOrders ?? []);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState(null);

  // Sorted+deduped symbol set used for WS subscription. Changing this triggers
  // a graceful reconnect with the new stream list.
  const subscriptionKey = useMemo(() => {
    const symbols = [...new Set(positions.map(p => p.symbol.toLowerCase()))].sort();
    return symbols.join(',');
  }, [positions]);

  // ── Derived account with live P&L ──────────────────────────────────────────
  const totalUnrealizedProfit = useMemo(
    () => positions.reduce((s, p) => s + (p.unrealizedProfit || 0), 0),
    [positions],
  );

  const accountWithPnl = useMemo(() => {
    if (!account) return null;
    return {
      ...account,
      totalUnrealizedProfit,
      currentBalance: Number(account.totalWalletBalance || 0) + totalUnrealizedProfit,
    };
  }, [account, totalUnrealizedProfit]);

  // ── Sync incoming REST data ────────────────────────────────────────────────
  useEffect(() => {
    if (!initialData) return;
    if (initialData.account) setAccount(initialData.account);
    if (initialData.positions) setPositions(preparePositions(initialData.positions));
    if (initialData.openOrders) setOpenOrders(initialData.openOrders);
  }, [initialData]);

  // ── WebSocket lifecycle: re-runs ONLY when the symbol set changes ─────────
  useEffect(() => {
    // No open positions → no WebSocket. Wallet balance from REST is enough.
    if (!subscriptionKey) {
      setWsConnected(false);
      return;
    }

    const symbols = subscriptionKey.split(',');
    const isTestnet = process.env.NEXT_PUBLIC_BINANCE_TESTNET === 'true';
    const BASE = isTestnet ? 'wss://stream.binancefuture.com' : 'wss://fstream.binance.com';
    const url = `${BASE}/stream?streams=${symbols.map(s => `${s}@miniTicker`).join('/')}`;

    let ws = null;
    let stopped = false;
    let retryCount = 0;
    let lastMessageAt = 0;
    let retryTimer = null;
    let watchdog = null;
    let plannedReconnect = null;
    let handshakeTimeout = null;

    function clearTimers() {
      clearTimeout(retryTimer);
      clearTimeout(handshakeTimeout);
      clearTimeout(plannedReconnect);
      clearInterval(watchdog);
      retryTimer = handshakeTimeout = plannedReconnect = watchdog = null;
    }

    function closeCurrent(reason = 'replace') {
      const current = ws;
      ws = null;
      if (current && current.readyState !== WebSocket.CLOSED) {
        try { current.close(1000, reason); } catch { /* noop */ }
      }
    }

    function scheduleRetry() {
      if (stopped) return;
      if (retryCount >= MAX_RETRIES) {
        setError('Live price feed unavailable. Please refresh the page.');
        return;
      }
      retryCount += 1;
      const delay = Math.min(RETRY_BASE_MS * Math.pow(1.5, retryCount - 1), RETRY_MAX_MS);
      console.log(`[FuturesWS] Retry ${retryCount}/${MAX_RETRIES} in ${(delay / 1000).toFixed(1)}s`);
      retryTimer = setTimeout(connect, delay);
    }

    function connect() {
      if (stopped) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        console.log('[FuturesWS] Offline, waiting for online event');
        return;
      }

      clearTimers();
      closeCurrent('reconnect');

      console.log(`[FuturesWS] Connecting (${symbols.length} symbol${symbols.length > 1 ? 's' : ''})…`);

      let socket;
      try {
        socket = new WebSocket(url);
      } catch (err) {
        console.error('[FuturesWS] Create failed:', err);
        scheduleRetry();
        return;
      }
      ws = socket;

      handshakeTimeout = setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          console.warn('[FuturesWS] Handshake timeout');
          try { socket.close(); } catch { /* noop */ }
        }
      }, HANDSHAKE_TIMEOUT_MS);

      socket.onopen = () => {
        clearTimeout(handshakeTimeout);
        handshakeTimeout = null;
        if (stopped || ws !== socket) {
          try { socket.close(1000, 'stale'); } catch { /* noop */ }
          return;
        }
        retryCount = 0;
        lastMessageAt = Date.now();
        setWsConnected(true);
        setError(null);
        console.log('[FuturesWS] ✅ Connected');

        // No-data watchdog – Binance ticks every ~1s for active symbols
        clearInterval(watchdog);
        watchdog = setInterval(() => {
          if (Date.now() - lastMessageAt > STALE_MESSAGE_TIMEOUT_MS) {
            console.warn('[FuturesWS] Silent for 60s, forcing reconnect');
            try { socket.close(4000, 'stale-data'); } catch { /* noop */ }
          }
        }, 15_000);

        // Pre-empt the 24h server-side close
        clearTimeout(plannedReconnect);
        plannedReconnect = setTimeout(() => {
          console.log('[FuturesWS] Planned 23h reconnect');
          try { socket.close(1000, 'planned-reconnect'); } catch { /* noop */ }
        }, PLANNED_RECONNECT_MS);
      };

      socket.onmessage = (evt) => {
        if (stopped || ws !== socket) return;
        lastMessageAt = Date.now();
        try {
          const payload = JSON.parse(evt.data);
          const data = payload?.data;
          if (!data?.s || !data?.c) return;
          const livePrice = parseFloat(data.c);
          if (!Number.isFinite(livePrice)) return;

          setPositions(prev => {
            let changed = false;
            const wsSymbol = data.s.toLowerCase();
            const next = prev.map(p => {
              if (p.symbol.toLowerCase() !== wsSymbol) return p;
              if (Math.abs(p.markPrice - livePrice) < 1e-10) return p;
              changed = true;
              return {
                ...p,
                markPrice: livePrice,
                unrealizedProfit: calcPnl({ ...p, markPrice: livePrice }),
              };
            });
            if (changed) console.log(`[FuturesWS] 📊 ${wsSymbol.toUpperCase()} @ ${livePrice} | PnL updated`);
            return changed ? next : prev;
          });
        } catch { /* ignore malformed frames */ }
      };

      socket.onerror = (err) => {
        console.error('[FuturesWS] WebSocket error event:', err);
        setError('Live price feed connection error. Retrying...');
      };

      socket.onclose = (evt) => {
        clearTimeout(handshakeTimeout);
        clearInterval(watchdog);
        clearTimeout(plannedReconnect);
        handshakeTimeout = watchdog = plannedReconnect = null;
        if (ws === socket) ws = null;
        if (stopped) return;
        setWsConnected(false);
        console.log('[FuturesWS] Closed code=', evt.code, 'reason=', evt.reason || '(none)');
        scheduleRetry();
      };
    }

    // Network/visibility recovery
    const onOnline = () => {
      console.log('[FuturesWS] Online → reconnect');
      retryCount = 0;
      clearTimeout(retryTimer);
      connect();
    };
    const onOffline = () => closeCurrent('offline');
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !stopped) {
        const idle = Date.now() - lastMessageAt;
        if (idle > STALE_MESSAGE_TIMEOUT_MS) {
          console.log('[FuturesWS] Tab visible after idle → reconnect');
          retryCount = 0;
          clearTimeout(retryTimer);
          connect();
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      document.addEventListener('visibilitychange', onVisibility);
    }

    // Tiny delay so REST data is on screen before WS opens
    const startTimer = setTimeout(connect, 200);

    return () => {
      stopped = true;
      clearTimeout(startTimer);
      clearTimers();
      closeCurrent('cleanup');
      setWsConnected(false);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [subscriptionKey]); // ← only re-runs when the symbol set actually changes

  // ── Manual REST refresh ────────────────────────────────────────────────────
  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/futures?type=positions');
      const json = await res.json();
      const data = json?.data ?? json;
      if (data.account) setAccount(data.account);
      if (data.positions) setPositions(preparePositions(data.positions));
      if (data.openOrders) setOpenOrders(data.openOrders);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // ── REST refresh (every 5 min) ──────────────────────────────────────────────
  // The live WebSocket keeps mark price and PnL updating in real time. This slow
  // REST poll only re-syncs positions, SL/TP (from the exchange) and balance so
  // we don't hammer the Binance REST API. Initial data comes from the SSR/first
  // load; this interval refreshes it every 5 minutes.
  const pollingRef = useRef(false);
  useEffect(() => {
    if (!account) return;
    if (pollingRef.current) return;
    pollingRef.current = true;
    const POLL_MS = 5 * 60_000; // 5 minutes
    const interval = setInterval(() => {
      refetch();
    }, POLL_MS);
    return () => {
      clearInterval(interval);
      pollingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!account]);

  return { account: accountWithPnl, positions, openOrders, wsConnected, error, refetch };
}

// ─── Spot Stream ───────────────────────────────────────────────────────────────
export function useBinanceSpotStream({ initialData = null } = {}) {
  const [holdings, setHoldings] = useState(() => initialData?.holdings ?? []);
  const [totalValue, setTotalValue] = useState(() => initialData?.totalValue ?? 0);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState(null);

  const subscriptionKey = useMemo(() => {
    const symbols = [...new Set(
      holdings
        .filter(h => h.currency && h.currency !== 'USDT' && h.currency !== 'BUSD' && (h.amount || 0) > 0)
        .map(h => `${h.currency.toLowerCase()}usdt`)
    )].sort();
    return symbols.join(',');
  }, [holdings]);

  useEffect(() => {
    if (!initialData) return;
    if (initialData.holdings) setHoldings(initialData.holdings);
    if (initialData.totalValue) setTotalValue(initialData.totalValue);
  }, [initialData]);

  useEffect(() => {
    if (!subscriptionKey) {
      setWsConnected(false);
      return;
    }

    const symbols = subscriptionKey.split(',');
    const isTestnet = process.env.NEXT_PUBLIC_BINANCE_TESTNET === 'true';
    const BASE = isTestnet ? 'wss://testnet.binance.vision' : 'wss://stream.binance.com:9443';
    const url = `${BASE}/stream?streams=${symbols.map(s => `${s}@miniTicker`).join('/')}`;

    let ws = null;
    let stopped = false;
    let retryCount = 0;
    let lastMessageAt = 0;
    let retryTimer = null;
    let watchdog = null;
    let plannedReconnect = null;
    let handshakeTimeout = null;

    function clearTimers() {
      clearTimeout(retryTimer);
      clearTimeout(handshakeTimeout);
      clearTimeout(plannedReconnect);
      clearInterval(watchdog);
      retryTimer = handshakeTimeout = plannedReconnect = watchdog = null;
    }

    function closeCurrent(reason = 'replace') {
      const current = ws;
      ws = null;
      if (current && current.readyState !== WebSocket.CLOSED) {
        try { current.close(1000, reason); } catch { /* noop */ }
      }
    }

    function scheduleRetry() {
      if (stopped) return;
      if (retryCount >= MAX_RETRIES) {
        setError('Spot price feed unavailable. Please refresh the page.');
        return;
      }
      retryCount += 1;
      const delay = Math.min(RETRY_BASE_MS * Math.pow(1.5, retryCount - 1), RETRY_MAX_MS);
      retryTimer = setTimeout(connect, delay);
    }

    function connect() {
      if (stopped) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      clearTimers();
      closeCurrent('reconnect');

      console.log(`[SpotWS] Connecting (${symbols.length} symbols)…`);
      let socket;
      try { socket = new WebSocket(url); } catch (err) {
        console.error('[SpotWS] Create failed:', err);
        scheduleRetry();
        return;
      }
      ws = socket;

      handshakeTimeout = setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          try { socket.close(); } catch { /* noop */ }
        }
      }, HANDSHAKE_TIMEOUT_MS);

      socket.onopen = () => {
        clearTimeout(handshakeTimeout);
        handshakeTimeout = null;
        if (stopped || ws !== socket) {
          try { socket.close(1000, 'stale'); } catch { /* noop */ }
          return;
        }
        retryCount = 0;
        lastMessageAt = Date.now();
        setWsConnected(true);
        setError(null);
        console.log('[SpotWS] ✅ Connected');

        clearInterval(watchdog);
        watchdog = setInterval(() => {
          if (Date.now() - lastMessageAt > STALE_MESSAGE_TIMEOUT_MS) {
            try { socket.close(4000, 'stale-data'); } catch { /* noop */ }
          }
        }, 15_000);

        clearTimeout(plannedReconnect);
        plannedReconnect = setTimeout(() => {
          try { socket.close(1000, 'planned-reconnect'); } catch { /* noop */ }
        }, PLANNED_RECONNECT_MS);
      };

      socket.onmessage = (evt) => {
        if (stopped || ws !== socket) return;
        lastMessageAt = Date.now();
        try {
          const data = JSON.parse(evt.data)?.data;
          if (!data?.s || !data?.c) return;
          const currency = data.s.replace('USDT', '');
          const livePrice = parseFloat(data.c);
          if (!Number.isFinite(livePrice)) return;

          setHoldings(prev => {
            let changed = false;
            let newTotal = 0;
            const next = prev.map(h => {
              if (h.currency !== currency) { newTotal += h.valueUSD || 0; return h; }
              if (Math.abs((h.price || 0) - livePrice) < 1e-10) { newTotal += h.valueUSD || 0; return h; }
              changed = true;
              const valueUSD = (h.amount || 0) * livePrice;
              newTotal += valueUSD;
              return { ...h, price: livePrice, valueUSD };
            });
            if (changed) setTotalValue(newTotal);
            return changed ? next : prev;
          });
        } catch { /* ignore */ }
      };

      socket.onerror = (err) => {
        console.error('[SpotWS] WebSocket error event:', err);
        setError('Spot price feed connection error. Retrying...');
      };

      socket.onclose = (evt) => {
        clearTimeout(handshakeTimeout);
        clearInterval(watchdog);
        clearTimeout(plannedReconnect);
        handshakeTimeout = watchdog = plannedReconnect = null;
        if (ws === socket) ws = null;
        if (stopped) return;
        setWsConnected(false);
        console.log('[SpotWS] Closed code=', evt.code);
        scheduleRetry();
      };
    }

    const onOnline = () => { retryCount = 0; clearTimeout(retryTimer); connect(); };
    const onOffline = () => closeCurrent('offline');

    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
    }

    const startTimer = setTimeout(connect, 200);

    return () => {
      stopped = true;
      clearTimeout(startTimer);
      clearTimers();
      closeCurrent('cleanup');
      setWsConnected(false);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      }
    };
  }, [subscriptionKey]);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio');
      const data = await res.json();
      if (data.holdings) setHoldings(data.holdings);
      if (data.totalValue) setTotalValue(data.totalValue);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  return { holdings, totalValue, wsConnected, error, refetch };
}
