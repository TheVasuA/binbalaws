'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Live Futures Portfolio Hook
 *
 * How it works:
 *   - Full snapshot (positions + SL/TP algo orders) ONCE on load, then every 5 min
 *   - Public @miniTicker WebSocket → live price → live PnL / portfolio value
 *   - Authenticated User Data Stream → LIVE wallet balance + open orders (pushed
 *     instantly by Binance via ACCOUNT_UPDATE / ORDER_TRADE_UPDATE)
 *   - A 60s REST poll remains only as a fallback if a stream is briefly down
 *
 * SL/TP stay on the slow 5-min cycle (they rarely change and the algo-order
 * fetch is heavier).
 */

const REST_REFRESH_MS = 5 * 60_000;  // 5 min — positions + SL/TP (algo orders)
const BALANCE_REFRESH_MS = 5_000;    // 5s — wallet balance + open orders (also
                                     // covers networks where the User Data Stream
                                     // WS connects but delivers no frames)

const WS_URL = process.env.NEXT_PUBLIC_BINANCE_TESTNET === 'true'
  ? 'wss://stream.binancefuture.com'
  : 'wss://fstream.binance.com';

function calcPnl(side, positionAmt, entryPrice, markPrice) {
  if (!markPrice || !entryPrice || !positionAmt) return 0;
  return side === 'LONG'
    ? (markPrice - entryPrice) * positionAmt
    : (entryPrice - markPrice) * positionAmt;
}

export function useBackendFuturesStream() {
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [openOrders, setOpenOrders] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  const wsRef = useRef(null); // holds the price EventSource (SSE)
  const symbolsRef = useRef('');

  // ─── REST: fetch account data ─────────────────────────────────────────────
  const fetchAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/futures?type=positions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'API error');

      const d = json.data;
      setAccount(d.account || null);
      setOpenOrders(d.openOrders || []);
      setError(null);
      setLoaded(true);

      // Update positions but preserve WS-updated markPrice if newer
      if (d.positions) {
        setPositions(d.positions.map(p => ({
          ...p,
          positionAmt: Math.abs(parseFloat(p.positionAmt || 0)),
          entryPrice: parseFloat(p.entryPrice || 0),
          markPrice: parseFloat(p.markPrice || 0),
          unrealizedProfit: parseFloat(p.unrealizedProfit || 0),
          leverage: parseInt(p.leverage || 0),
          side: p.side || (parseFloat(p.positionAmt) > 0 ? 'LONG' : 'SHORT'),
        })));
      }
    } catch (err) {
      console.error('[REST] Fetch error:', err.message);
      setError(err.message);
    }
  }, []);

  // ─── Light REST poll: wallet balance + open orders only ───────────────────
  // Keeps live balance, total portfolio value and the pending-orders list fresh
  // without re-fetching positions/SL-TP (which stay on the slow 5-min cycle).
  const fetchBalanceAndOrders = useCallback(async () => {
    try {
      const [accRes, ordRes] = await Promise.all([
        fetch('/api/futures?type=account'),
        fetch('/api/futures?type=orders'),
      ]);
      const accJson = await accRes.json();
      const ordJson = await ordRes.json();

      if (accJson.success && accJson.data) {
        // Merge only the balance fields; keep everything else the snapshot set.
        setAccount(prev => ({ ...(prev || {}), ...accJson.data }));
      }
      if (ordJson.success && Array.isArray(ordJson.data)) {
        setOpenOrders(ordJson.data);
      }
      setError(null);
    } catch (err) {
      console.error('[REST balance] Fetch error:', err.message);
    }
  }, []);

  // ─── Full snapshot once on load, then every 5 minutes (positions + SL/TP) ──
  useEffect(() => {
    fetchAccount(); // immediate first fetch on browser load
    const id = setInterval(fetchAccount, REST_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchAccount]);

  // ─── Balance + orders safety refresh ──────────────────────────────────────
  // The User Data Stream (below) pushes balance/orders live. This slow poll is
  // only a fallback in case the stream is briefly down; it runs every 60s.
  useEffect(() => {
    if (!account) return; // wait for the first full snapshot
    const id = setInterval(fetchBalanceAndOrders, BALANCE_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!account, fetchBalanceAndOrders]);

  // ─── Compute live balance from positions ──────────────────────────────────
  const liveAccount = account ? (() => {
    const totalUnrealizedProfit = positions.reduce(
      (sum, p) => sum + (p.unrealizedProfit || 0), 0
    );
    const totalWalletBalance = Number(account.totalWalletBalance || 0);
    const totalMarginBalance = totalWalletBalance + totalUnrealizedProfit;
    const availableBalance = Number(account.availableBalance || 0);

    return {
      ...account,
      totalWalletBalance,
      totalUnrealizedProfit,
      totalMarginBalance,
      availableBalance,
      currentBalance: totalMarginBalance,
    };
  })() : null;

  // ─── Live prices via server SSE proxy (EventSource) ───────────────────────
  // A direct browser→Binance WebSocket does not deliver data frames on some
  // networks (proxy/firewall drops them), which freezes PnL. The server-side
  // SSE proxy (/api/futures/stream) polls mark prices and pushes them over
  // plain HTTP, which passes through reliably. Live PnL / portfolio value is
  // computed here from entryPrice on every price update.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (positions.length === 0) return;

    const symbols = [...new Set(positions.map(p => p.symbol.toLowerCase()))].sort();
    const key = symbols.join(',');
    if (key === symbolsRef.current && wsRef.current) {
      return; // already streaming this symbol set
    }
    symbolsRef.current = key;

    // Close any existing EventSource
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    const url = `/api/futures/stream?symbols=${encodeURIComponent(symbols.join(','))}`;
    const es = new EventSource(url);
    wsRef.current = es;

    es.onopen = () => {
      console.log('[PriceSSE] Connected:', symbols.length, 'symbols');
      setWsConnected(true);
    };

    es.onmessage = (e) => {
      let payload;
      try { payload = JSON.parse(e.data); } catch { return; }
      if (payload?.connected) { setWsConnected(true); return; }
      if (payload?.error) return;

      // payload = { SYMBOL: markPrice, ... }
      setPositions(prev => {
        let changed = false;
        const next = prev.map(p => {
          const price = payload[p.symbol];
          if (!Number.isFinite(price)) return p;
          if (Math.abs((p.markPrice || 0) - price) < 1e-9) return p;
          changed = true;
          return {
            ...p,
            markPrice: price,
            unrealizedProfit: calcPnl(p.side, p.positionAmt, p.entryPrice, price),
          };
        });
        return changed ? next : prev;
      });
    };

    es.onerror = () => {
      // EventSource auto-reconnects; just reflect status.
      setWsConnected(false);
    };

    return () => {
      try { es.close(); } catch {}
      if (wsRef.current === es) wsRef.current = null;
      setWsConnected(false);
    };
  }, [positions.map(p => p.symbol).sort().join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── User Data Stream: LIVE wallet balance + open orders (authenticated) ──
  // Binance pushes ACCOUNT_UPDATE (balances) and ORDER_TRADE_UPDATE (orders)
  // the instant they change. This replaces the need to poll for them.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let stopped = false;
    let ws = null;
    let listenKey = null;
    let reconnectTimer = null;
    let keepaliveTimer = null;

    async function fetchOrdersNow() {
      try {
        const res = await fetch('/api/futures?type=orders');
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) setOpenOrders(json.data);
      } catch { /* ignore */ }
    }

    async function start() {
      if (stopped) return;
      try {
        const res = await fetch('/api/listenkey?type=futures');
        const json = await res.json();
        listenKey = json.listenKey;
        if (!listenKey) throw new Error('No listenKey');
      } catch (err) {
        console.error('[UserWS] listenKey failed:', err.message);
        reconnectTimer = setTimeout(start, 5000);
        return;
      }
      if (stopped) return;

      const url = `${WS_URL}/ws/${listenKey}`;
      try {
        ws = new WebSocket(url);
      } catch {
        reconnectTimer = setTimeout(start, 5000);
        return;
      }

      ws.onopen = () => {
        console.log('[UserWS] ✅ Connected (live balance + orders)');
        // Keepalive the listenKey every 30 min (Binance expires it after 60).
        clearInterval(keepaliveTimer);
        keepaliveTimer = setInterval(() => {
          fetch(`/api/listenkey?type=futures&listenKey=${listenKey}`, { method: 'PUT' })
            .catch(() => { /* ignore */ });
        }, 30 * 60_000);
      };

      ws.onmessage = (e) => {
        if (stopped) return;
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }

        // Live wallet balance from ACCOUNT_UPDATE (event: 'ACCOUNT_UPDATE').
        if (msg.e === 'ACCOUNT_UPDATE') {
          const balances = msg.a?.B || [];
          const usdt = balances.find(b => b.a === 'USDT');
          if (usdt) {
            const wallet = parseFloat(usdt.wb); // wallet balance
            const crossWallet = parseFloat(usdt.cw);
            setAccount(prev => ({
              ...(prev || {}),
              totalWalletBalance: Number.isFinite(wallet) ? wallet : prev?.totalWalletBalance,
              availableBalance: Number.isFinite(crossWallet) ? crossWallet : prev?.availableBalance,
            }));
          }

          // Apply live position amount/entry changes so a new/closed position
          // shows immediately (price/PnL still come from the miniTicker stream).
          const posUpdates = msg.a?.P || [];
          if (posUpdates.length) {
            setPositions(prev => {
              const map = new Map(prev.map(p => [p.symbol, p]));
              posUpdates.forEach(u => {
                const amt = parseFloat(u.pa);
                if (!amt) { map.delete(u.s); return; } // position closed
                const existing = map.get(u.s) || {};
                map.set(u.s, {
                  ...existing,
                  symbol: u.s,
                  positionAmt: Math.abs(amt),
                  entryPrice: parseFloat(u.ep) || existing.entryPrice || 0,
                  side: amt > 0 ? 'LONG' : 'SHORT',
                  markPrice: existing.markPrice || parseFloat(u.ep) || 0,
                  leverage: existing.leverage || 0,
                });
              });
              return [...map.values()];
            });
          }
        }

        // Live open-orders list on any order lifecycle event.
        if (msg.e === 'ORDER_TRADE_UPDATE') {
          fetchOrdersNow();
        }
      };

      ws.onerror = () => { /* onclose handles reconnect */ };

      ws.onclose = () => {
        clearInterval(keepaliveTimer);
        if (stopped) return;
        console.log('[UserWS] Closed, reconnecting…');
        reconnectTimer = setTimeout(start, 2000);
      };
    }

    start();

    return () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      clearInterval(keepaliveTimer);
      if (ws) { try { ws.close(1000); } catch { /* noop */ } }
      // Best-effort close of the listenKey server-side.
      if (listenKey) {
        fetch(`/api/listenkey?type=futures&listenKey=${listenKey}`, { method: 'DELETE' })
          .catch(() => { /* ignore */ });
      }
    };
  }, []); // once per mount

  return {
    account: liveAccount,
    positions,
    openOrders,
    wsConnected,
    error,
    loaded,
    refetch: fetchAccount,
  };
}
