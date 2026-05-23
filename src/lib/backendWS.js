'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Live Futures Portfolio Hook
 *
 * How it works:
 *   - Polls GET /api/futures?type=positions every 2 seconds for full account snapshot
 *   - Connects to Binance Futures WebSocket for real-time mark price updates
 *   - Computes live PnL from WebSocket price ticks between REST polls
 *
 * This is intentionally simple. REST every 2s guarantees data freshness.
 * WebSocket fills the gaps between polls with sub-second price updates.
 */

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

  const wsRef = useRef(null);
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

  // ─── Poll every 2 seconds ─────────────────────────────────────────────────
  useEffect(() => {
    fetchAccount(); // immediate first fetch
    const id = setInterval(fetchAccount, 2000);
    return () => clearInterval(id);
  }, [fetchAccount]);

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

  // ─── WebSocket: connect to miniTicker for live prices ─────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (positions.length === 0) return;

    const symbols = [...new Set(positions.map(p => p.symbol.toLowerCase()))].sort();
    const key = symbols.join(',');

    // Don't reconnect if symbols haven't changed
    if (key === symbolsRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }
    symbolsRef.current = key;

    // Close existing connection
    if (wsRef.current) {
      try { wsRef.current.close(1000); } catch {}
      wsRef.current = null;
    }

    const streamUrl = `${WS_URL}/stream?streams=${symbols.map(s => `${s}@miniTicker`).join('/')}`;
    let stopped = false;
    let reconnectTimer = null;
    let ws = null;

    function connect() {
      if (stopped) return;

      try {
        ws = new WebSocket(streamUrl);
        wsRef.current = ws;
      } catch {
        reconnectTimer = setTimeout(connect, 2000);
        return;
      }

      ws.onopen = () => {
        console.log('[WS] Connected:', symbols.length, 'symbols');
        setWsConnected(true);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          const data = msg?.data;
          if (!data?.s || !data?.c) return;

          const sym = data.s.toLowerCase();
          const price = parseFloat(data.c);
          if (!Number.isFinite(price)) return;

          // Update position mark price and PnL
          setPositions(prev => {
            let changed = false;
            const next = prev.map(p => {
              if (p.symbol.toLowerCase() !== sym) return p;
              if (Math.abs((p.markPrice || 0) - price) < 0.000001) return p;
              changed = true;
              return {
                ...p,
                markPrice: price,
                unrealizedProfit: calcPnl(p.side, p.positionAmt, p.entryPrice, price),
              };
            });
            return changed ? next : prev;
          });
        } catch {}
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        wsRef.current = null;
        if (stopped) return;
        setWsConnected(false);
        reconnectTimer = setTimeout(connect, 1000);
      };
    }

    connect();

    // Ping every 3 min to keep alive
    const pingId = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ method: 'PING' }));
      }
    }, 180000);

    return () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingId);
      if (ws) { try { ws.close(1000); } catch {} }
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [positions.map(p => p.symbol).sort().join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

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
