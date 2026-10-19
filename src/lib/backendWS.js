'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PORTFOLIO_REFRESH_EVENT, COMPOUND_REFRESH_EVENT } from '@/lib/portfolioRefresh';

/**
 * Live Futures Portfolio Hook
 *
 * How it works:
 *   - Full snapshot (positions + SL/TP algo orders) on load, on every order
 *     event (User Data Stream), when another page calls requestPortfolioRefresh(),
 *     and every 45s as a safety net
 *   - Public SSE price stream → live PnL / portfolio value
 *   - Authenticated User Data Stream → wallet balance + position deltas; any
 *     ORDER_TRADE_UPDATE triggers a debounced fresh snapshot (SL/TP live)
 */

const REST_REFRESH_MS = 45_000;      // safety-net full snapshot
const BALANCE_REFRESH_MS = 5_000;    // wallet + classic open orders fallback
const WS_SNAPSHOT_DEBOUNCE_MS = 400; // coalesce burst WS events into one fetch

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
  const [dailyPnl, setDailyPnl] = useState(null); // { realizedPnl, ... }

  const wsRef = useRef(null); // holds the price EventSource (SSE)
  const symbolsRef = useRef('');
  const wsSnapshotTimer = useRef(null);
  const followUpTimers = useRef([]);

  const applyDailyPnlPayload = useCallback((data) => {
    if (!data) return;
    setDailyPnl(data);
    if (data.goalSync?.applied && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(COMPOUND_REFRESH_EVENT));
    }
  }, []);

  const applySnapshotData = useCallback((d) => {
    setAccount(d.account || null);
    setOpenOrders(d.openOrders || []);
    setError(null);
    setLoaded(true);

    fetch('/api/futures?type=dailyPnl&fresh=1')
      .then((r) => r.json())
      .then((j) => { if (j.success && j.data) applyDailyPnlPayload(j.data); })
      .catch(() => { /* ignore */ });

    if (d.positions) {
      setPositions((prev) => {
        const markBySymbol = new Map(prev.map((p) => [p.symbol, p.markPrice]));
        return d.positions.map((p) => {
          const mark = markBySymbol.get(p.symbol);
          const entryPrice = parseFloat(p.entryPrice || 0);
          const positionAmt = Math.abs(parseFloat(p.positionAmt || 0));
          const side = p.side || (parseFloat(p.positionAmt) > 0 ? 'LONG' : 'SHORT');
          const markPrice = Number.isFinite(mark) && mark > 0
            ? mark
            : parseFloat(p.markPrice || 0);
          const unrealizedProfit = Number.isFinite(mark) && mark > 0
            ? calcPnl(side, positionAmt, entryPrice, mark)
            : parseFloat(p.unrealizedProfit || 0);
          return {
            ...p,
            positionAmt,
            entryPrice,
            markPrice,
            unrealizedProfit,
            leverage: parseInt(p.leverage || 0, 10),
            side,
          };
        });
      });
    }
  }, [applyDailyPnlPayload]);

  // ─── REST: full snapshot (positions + SL/TP algo orders) ─────────────────
  const fetchAccount = useCallback(async ({ fresh = false } = {}) => {
    try {
      const q = fresh ? '&fresh=1' : '';
      const res = await fetch(`/api/futures?type=positions${q}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'API error');
      applySnapshotData(json.data);
    } catch (err) {
      console.error('[REST] Fetch error:', err.message);
      setError(err.message);
    }
  }, [applySnapshotData]);

  const scheduleFreshSnapshot = useCallback((withFollowUps = false) => {
    if (wsSnapshotTimer.current) clearTimeout(wsSnapshotTimer.current);
    wsSnapshotTimer.current = setTimeout(() => {
      wsSnapshotTimer.current = null;
      fetchAccount({ fresh: true });
    }, WS_SNAPSHOT_DEBOUNCE_MS);

    if (withFollowUps) {
      followUpTimers.current.forEach(clearTimeout);
      followUpTimers.current = [
        setTimeout(() => fetchAccount({ fresh: true }), 800),
        setTimeout(() => fetchAccount({ fresh: true }), 2200),
      ];
    }
  }, [fetchAccount]);

  // ─── Light REST poll: wallet balance + open orders only ───────────────────
  const fetchBalanceAndOrders = useCallback(async () => {
    try {
      const [accRes, ordRes, pnlRes] = await Promise.all([
        fetch('/api/futures?type=account&fresh=1'),
        fetch('/api/futures?type=orders&fresh=1'),
        fetch('/api/futures?type=dailyPnl&fresh=1'),
      ]);
      const accJson = await accRes.json();
      const ordJson = await ordRes.json();
      const pnlJson = await pnlRes.json();

      if (accJson.success && accJson.data) {
        // Merge only the balance fields; keep everything else the snapshot set.
        setAccount(prev => ({ ...(prev || {}), ...accJson.data }));
      }
      if (ordJson.success && Array.isArray(ordJson.data)) {
        setOpenOrders(ordJson.data);
      }
      // Today's realized PnL — drives the target / loss-limit bars.
      if (pnlJson.success && pnlJson.data) {
        applyDailyPnlPayload(pnlJson.data);
      }
      setError(null);
    } catch (err) {
      console.error('[REST balance] Fetch error:', err.message);
    }
  }, [applyDailyPnlPayload]);

  // ─── Full snapshot on load + safety net poll ─────────────────────────────
  useEffect(() => {
    fetchAccount({ fresh: true });
    const id = setInterval(() => fetchAccount({ fresh: false }), REST_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchAccount]);

  const scheduleFreshRef = useRef(scheduleFreshSnapshot);
  scheduleFreshRef.current = scheduleFreshSnapshot;

  // Other pages (New Order, close, SL/TP) signal an immediate fresh pull.
  useEffect(() => {
    const onRefresh = () => scheduleFreshSnapshot(true);
    window.addEventListener(PORTFOLIO_REFRESH_EVENT, onRefresh);
    return () => {
      window.removeEventListener(PORTFOLIO_REFRESH_EVENT, onRefresh);
      followUpTimers.current.forEach(clearTimeout);
    };
  }, [scheduleFreshSnapshot]);

  // ─── Balance + orders safety refresh ──────────────────────────────────────
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
        const res = await fetch('/api/futures?type=orders&fresh=1');
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
            scheduleFreshRef.current(false);
          }
        }

        // Any order lifecycle → refresh pending orders + full snapshot (SL/TP).
        if (msg.e === 'ORDER_TRADE_UPDATE') {
          fetchOrdersNow();
          scheduleFreshRef.current(false);
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
    dailyPnl,
    refetch: () => fetchAccount({ fresh: true }),
  };
}
