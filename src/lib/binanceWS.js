'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// Binance WebSocket endpoints
const FUTURES_WS =
  process.env.NEXT_PUBLIC_BINANCE_TESTNET === 'true'
    ? 'wss://stream.binancefuture.com/ws'
    : 'wss://fstream.binance.com/ws';

const SPOT_WS =
  process.env.NEXT_PUBLIC_BINANCE_TESTNET === 'true'
    ? 'wss://testnet.binance.vision/ws'
    : 'wss://stream.binance.com:9443/ws';

// Helpers

function mapWsOrderToShape(o) {
  return {
    id: String(o.i),
    symbol: o.s,
    side: o.S.toLowerCase(),
    positionSide: o.ps,
    type: o.o.toLowerCase(),
    price: parseFloat(o.p),
    stopPrice: parseFloat(o.sp),
    origQty: o.q,           // keep raw string so FuturesPositions can display it
    amount: parseFloat(o.q),
    filled: parseFloat(o.z),
    remaining: parseFloat(o.q) - parseFloat(o.z),
    status: o.X.toLowerCase(),
    reduceOnly: o.R,
    timestamp: o.T,
    datetime: new Date(o.T).toISOString(),
  };
}

// useBinanceFuturesStream
// Manages:
//   1. Futures user-data WebSocket (account + order events)
//   2. Futures mark-price WebSocket (all symbols, 1 s cadence)
export function useBinanceFuturesStream({ initialData = null } = {}) {
  const [account, setAccount] = useState(null);
  const [positions, setPositions] = useState([]);
  const [openOrders, setOpenOrders] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  const listenKeyRef = useRef(null);
  const userDataWsRef = useRef(null);
  const markPriceWsRef = useRef(null);
  const keepaliveTimerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const unmountedRef = useRef(false);

  // Sync initialData whenever the REST call resolves.
  useEffect(() => {
    if (!initialData) return;
    if (initialData.account) setAccount(initialData.account);
    if (initialData.positions) setPositions(initialData.positions);
    // openOrders is populated from _debug_openOrders (raw getFuturesOpenOrders output).
    if (initialData._debug_openOrders) setOpenOrders(initialData._debug_openOrders);
  }, [initialData]);

  // Recalculate total unrealized PnL on account whenever positions change.
  useEffect(() => {
    setAccount(prev => {
      if (!prev) return prev;
      const totalUnrealizedProfit = positions.reduce(
        (sum, p) => sum + (p.unrealizedProfit || 0),
        0,
      );
      return { ...prev, totalUnrealizedProfit };
    });
  }, [positions]);

  // User-data event handler.
  const handleUserDataEvent = useCallback((event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    switch (data.e) {
      case 'ACCOUNT_UPDATE': {
        const balances = data.a?.B || [];
        const posUpdates = data.a?.P || [];

        // Update wallet / available balance
        setAccount(prev => {
          if (!prev) return prev;
          const usdt = balances.find(b => b.a === 'USDT');
          if (!usdt) return prev;
          return {
            ...prev,
            totalWalletBalance: parseFloat(usdt.wb),
            availableBalance: parseFloat(usdt.cw),
          };
        });

        // Update positions
        setPositions(prev => {
          let updated = [...prev];
          posUpdates.forEach(pu => {
            const posAmt = parseFloat(pu.pa);
            const idx = updated.findIndex(p => p.symbol === pu.s);
            if (posAmt === 0) {
              // Position fully closed
              if (idx !== -1) updated.splice(idx, 1);
            } else if (idx !== -1) {
              // Update existing position
              updated[idx] = {
                ...updated[idx],
                positionAmt: Math.abs(posAmt),
                entryPrice: parseFloat(pu.ep),
                unrealizedProfit: parseFloat(pu.up),
                side: posAmt > 0 ? 'LONG' : 'SHORT',
              };
            } else {
              // Brand-new position - add with partial data.
              updated.push({
                symbol: pu.s,
                side: posAmt > 0 ? 'LONG' : 'SHORT',
                positionAmt: Math.abs(posAmt),
                entryPrice: parseFloat(pu.ep),
                unrealizedProfit: parseFloat(pu.up),
                markPrice: parseFloat(pu.ep), // estimate until mark-price WS kicks in
                liquidationPrice: 0,
                leverage: 1,
                marginType: pu.mt,
                isolatedMargin: parseFloat(pu.iw || 0),
                notionalValue: Math.abs(posAmt) * parseFloat(pu.ep),
                roe: 0,
                stopLossPrice: null,
                stopLossValue: null,
                takeProfitPrice: null,
                takeProfitValue: null,
              });
            }
          });
          return updated;
        });
        break;
      }

      case 'ORDER_TRADE_UPDATE': {
        const o = data.o;
        const orderId = String(o.i);
        const status = o.X; // NEW | PARTIALLY_FILLED | FILLED | CANCELED | EXPIRED

        if (status === 'NEW') {
          const newOrder = mapWsOrderToShape(o);
          setOpenOrders(prev => [...prev.filter(x => x.id !== orderId), newOrder]);

          // Sync SL/TP prices onto the matching position
          const isStopLoss = o.o === 'STOP_MARKET' || o.o === 'STOP';
          const isTakeProfit = o.o === 'TAKE_PROFIT_MARKET' || o.o === 'TAKE_PROFIT';
          if (isStopLoss || isTakeProfit) {
            const stopPx = parseFloat(o.sp);
            setPositions(prev =>
              prev.map(pos => {
                if (pos.symbol !== o.s) return pos;
                const sideMatch =
                  (pos.side === 'LONG' && o.S === 'SELL') ||
                  (pos.side === 'SHORT' && o.S === 'BUY');
                if (!sideMatch) return pos;
                if (isStopLoss) {
                  const slVal =
                    pos.side === 'LONG'
                      ? (stopPx - pos.entryPrice) * pos.positionAmt
                      : (pos.entryPrice - stopPx) * pos.positionAmt;
                  return { ...pos, stopLossPrice: stopPx, stopLossValue: slVal };
                }
                // take profit
                const tpVal =
                  pos.side === 'LONG'
                    ? (stopPx - pos.entryPrice) * pos.positionAmt
                    : (pos.entryPrice - stopPx) * pos.positionAmt;
                return { ...pos, takeProfitPrice: stopPx, takeProfitValue: tpVal };
              }),
            );
          }
        } else if (
          status === 'FILLED' ||
          status === 'CANCELED' ||
          status === 'EXPIRED'
        ) {
          setOpenOrders(prev => prev.filter(x => x.id !== orderId));

          // Clear SL/TP from position if the SL/TP order was removed
          const isStopLoss = o.o === 'STOP_MARKET' || o.o === 'STOP';
          const isTakeProfit = o.o === 'TAKE_PROFIT_MARKET' || o.o === 'TAKE_PROFIT';
          if ((isStopLoss || isTakeProfit) && status === 'CANCELED') {
            setPositions(prev =>
              prev.map(pos => {
                if (pos.symbol !== o.s) return pos;
                if (isStopLoss) return { ...pos, stopLossPrice: null, stopLossValue: null };
                return { ...pos, takeProfitPrice: null, takeProfitValue: null };
              }),
            );
          }
        } else if (status === 'PARTIALLY_FILLED') {
          setOpenOrders(prev =>
            prev.map(x => {
              if (x.id !== orderId) return x;
              const filled = parseFloat(o.z);
              return {
                ...x,
                filled,
                remaining: parseFloat(o.q) - filled,
                status: 'partially_filled',
              };
            }),
          );
        }
        break;
      }

      default:
        break;
    }
  }, []);

  // Connect futures user-data stream.
  const connectUserData = useCallback(async () => {
    if (unmountedRef.current) return;
    try {
      const res = await fetch('/api/listenkey?type=futures');
      const json = await res.json();
      if (!json.listenKey) throw new Error('No listenKey returned');
      if (unmountedRef.current) return;

      listenKeyRef.current = json.listenKey;
      const ws = new WebSocket(`${FUTURES_WS}/${json.listenKey}`);
      userDataWsRef.current = ws;

      ws.onopen = () => { if (!unmountedRef.current) setConnected(true); };
      ws.onmessage = handleUserDataEvent;
      ws.onerror = () => { if (!unmountedRef.current) setError('User-data stream error'); };
      ws.onclose = () => {
        if (unmountedRef.current) return;
        setConnected(false);
        reconnectTimerRef.current = setTimeout(() => connectUserData(), 5000);
      };

      // Keep listenKey alive every 20 minutes.
      keepaliveTimerRef.current = setInterval(() => {
        if (listenKeyRef.current && !unmountedRef.current) {
          fetch(
            `/api/listenkey?type=futures&listenKey=${listenKeyRef.current}`,
            { method: 'PUT' },
          ).catch(() => {});
        }
      }, 20 * 60 * 1000);
    } catch (err) {
      if (!unmountedRef.current) {
        setError(err.message);
        reconnectTimerRef.current = setTimeout(() => connectUserData(), 10000);
      }
    }
  }, [handleUserDataEvent]);

  // Connect mark-price stream (public, no auth).
  const connectMarkPrices = useCallback(() => {
    if (unmountedRef.current) return;
    const ws = new WebSocket(`${FUTURES_WS}/!markPrice@arr@1s`);
    markPriceWsRef.current = ws;

    ws.onmessage = (event) => {
      let prices;
      try { prices = JSON.parse(event.data); } catch { return; }

      // Build a lookup: symbol -> markPrice.
      const map = {};
      prices.forEach(p => { map[p.s] = parseFloat(p.p); });

      setPositions(prev =>
        prev.map(pos => {
          const mp = map[pos.symbol];
          if (mp === undefined) return pos;
          const pnl =
            pos.side === 'LONG'
              ? (mp - pos.entryPrice) * pos.positionAmt
              : (pos.entryPrice - mp) * pos.positionAmt;
          return { ...pos, markPrice: mp, unrealizedProfit: pnl };
        }),
      );
    };

    ws.onclose = () => {
      if (!unmountedRef.current) {
        setTimeout(() => connectMarkPrices(), 3000);
      }
    };
  }, []);

  // Lifecycle
  useEffect(() => {
    unmountedRef.current = false;
    connectUserData();
    connectMarkPrices();

    return () => {
      unmountedRef.current = true;
      clearInterval(keepaliveTimerRef.current);
      clearTimeout(reconnectTimerRef.current);

      if (userDataWsRef.current) {
        userDataWsRef.current.onclose = null;
        userDataWsRef.current.close();
      }
      if (markPriceWsRef.current) {
        markPriceWsRef.current.onclose = null;
        markPriceWsRef.current.close();
      }
      if (listenKeyRef.current) {
        fetch(
          `/api/listenkey?type=futures&listenKey=${listenKeyRef.current}`,
          { method: 'DELETE' },
        ).catch(() => {});
      }
    };
  }, [connectUserData, connectMarkPrices]);

  return { account, positions, openOrders, connected, error };
}

// useBinanceSpotStream
// Manages:
//   1. Spot user-data WebSocket (balance events)
//   2. Spot mini-ticker WebSocket (live prices for all symbols)
export function useBinanceSpotStream({ initialData = null } = {}) {
  const [holdings, setHoldings] = useState([]);
  const [totalValue, setTotalValue] = useState(0);
  const [connected, setConnected] = useState(false);

  const listenKeyRef = useRef(null);
  const userDataWsRef = useRef(null);
  const tickerWsRef = useRef(null);
  const keepaliveTimerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const unmountedRef = useRef(false);

  // Sync initial REST data.
  useEffect(() => {
    if (!initialData) return;
    if (initialData.holdings) setHoldings(initialData.holdings);
    if (initialData.totalValue) setTotalValue(initialData.totalValue);
  }, [initialData]);

  // Recalculate totalValue whenever holdings change.
  useEffect(() => {
    const total = holdings.reduce((sum, h) => sum + (h.valueUSD || 0), 0);
    setTotalValue(total);
  }, [holdings]);

  // Spot user-data event handler.
  const handleUserDataEvent = useCallback((event) => {
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    if (data.e === 'outboundAccountPosition') {
      const balances = data.B;
      setHoldings(prev => {
        const updated = prev.map(holding => {
          const b = balances.find(x => x.a === holding.currency);
          if (!b) return holding;
          const total = parseFloat(b.f) + parseFloat(b.l);
          return {
            ...holding,
            amount: total,
            free: parseFloat(b.f),
            used: parseFloat(b.l),
            valueUSD: total * holding.price,
          };
        });
        // Recalculate allocations
        const newTotal = updated.reduce((s, h) => s + h.valueUSD, 0);
        return updated.map(h => ({
          ...h,
          allocation: newTotal > 0 ? (h.valueUSD / newTotal) * 100 : 0,
        }));
      });
    }
  }, []);

  // Connect spot user-data stream.
  const connectUserData = useCallback(async () => {
    if (unmountedRef.current) return;
    try {
      const res = await fetch('/api/listenkey?type=spot');
      const json = await res.json();
      if (!json.listenKey) throw new Error('No spot listenKey returned');
      if (unmountedRef.current) return;

      listenKeyRef.current = json.listenKey;
      const ws = new WebSocket(`${SPOT_WS}/${json.listenKey}`);
      userDataWsRef.current = ws;

      ws.onopen = () => { if (!unmountedRef.current) setConnected(true); };
      ws.onmessage = handleUserDataEvent;
      ws.onclose = () => {
        if (unmountedRef.current) return;
        setConnected(false);
        reconnectTimerRef.current = setTimeout(() => connectUserData(), 5000);
      };

      keepaliveTimerRef.current = setInterval(() => {
        if (listenKeyRef.current && !unmountedRef.current) {
          fetch(
            `/api/listenkey?type=spot&listenKey=${listenKeyRef.current}`,
            { method: 'PUT' },
          ).catch(() => {});
        }
      }, 20 * 60 * 1000);
    } catch {
      if (!unmountedRef.current) {
        reconnectTimerRef.current = setTimeout(() => connectUserData(), 10000);
      }
    }
  }, [handleUserDataEvent]);

  // Connect mini-ticker stream (public).
  const connectMiniTickers = useCallback(() => {
    if (unmountedRef.current) return;
    const ws = new WebSocket(`${SPOT_WS}/!miniTicker@arr`);
    tickerWsRef.current = ws;

    ws.onmessage = (event) => {
      let tickers;
      try { tickers = JSON.parse(event.data); } catch { return; }

      // Build price map: symbol -> lastPrice.
      const map = {};
      tickers.forEach(t => { map[t.s] = parseFloat(t.c); });

      setHoldings(prev => {
        let newTotal = 0;
        const updated = prev.map(holding => {
          if (
            holding.currency === 'USDT' ||
            holding.currency === 'BUSD' ||
            holding.currency === 'USD'
          ) {
            newTotal += holding.valueUSD;
            return holding;
          }
          const symbol = `${holding.currency}USDT`;
          const price = map[symbol];
          if (price === undefined) {
            newTotal += holding.valueUSD;
            return holding;
          }
          const valueUSD = holding.amount * price;
          newTotal += valueUSD;
          return { ...holding, price, valueUSD };
        });
        // Recalculate allocations
        return updated.map(h => ({
          ...h,
          allocation: newTotal > 0 ? (h.valueUSD / newTotal) * 100 : 0,
        }));
      });
    };

    ws.onclose = () => {
      if (!unmountedRef.current) setTimeout(() => connectMiniTickers(), 3000);
    };
  }, []);

  // Lifecycle
  useEffect(() => {
    unmountedRef.current = false;
    connectUserData();
    connectMiniTickers();

    return () => {
      unmountedRef.current = true;
      clearInterval(keepaliveTimerRef.current);
      clearTimeout(reconnectTimerRef.current);

      if (userDataWsRef.current) {
        userDataWsRef.current.onclose = null;
        userDataWsRef.current.close();
      }
      if (tickerWsRef.current) {
        tickerWsRef.current.onclose = null;
        tickerWsRef.current.close();
      }
      if (listenKeyRef.current) {
        fetch(
          `/api/listenkey?type=spot&listenKey=${listenKeyRef.current}`,
          { method: 'DELETE' },
        ).catch(() => {});
      }
    };
  }, [connectUserData, connectMiniTickers]);

  return { holdings, totalValue, connected };
}
