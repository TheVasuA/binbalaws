'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

function getRiskValue({ side, entryPrice, positionAmt, triggerPrice }) {
  if (!Number.isFinite(triggerPrice)) {
    return null;
  }

  if (side === 'LONG') {
    return (triggerPrice - entryPrice) * positionAmt;
  }

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

function mergeStoredRiskIntoPositions(positions = []) {
  return positions.map((position) => {
    const normalized = normalizePosition(position);
    const stopLossPrice = normalized.stopLossPrice ?? null;
    const takeProfitPrice = normalized.takeProfitPrice ?? null;

    return {
      ...normalized,
      stopLossValue: normalized.stopLossValue ?? getRiskValue({
        side: normalized.side,
        entryPrice: normalized.entryPrice,
        positionAmt: normalized.positionAmt,
        triggerPrice: stopLossPrice,
      }),
      takeProfitValue: normalized.takeProfitValue ?? getRiskValue({
        side: normalized.side,
        entryPrice: normalized.entryPrice,
        positionAmt: normalized.positionAmt,
        triggerPrice: takeProfitPrice,
      }),
    };
  });
}

export function useBinanceFuturesStream({ initialData = null } = {}) {
  const [account, setAccount] = useState(() => initialData?.account || null);
  const [positions, setPositions] = useState(() => mergeStoredRiskIntoPositions(initialData?.positions || []));
  const [openOrders, setOpenOrders] = useState(() => initialData?.openOrders || []);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  const eventSourceRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const unmountedRef = useRef(false);

  const totalUnrealizedProfit = positions.reduce(
    (sum, position) => sum + (Number(position.unrealizedProfit) || 0),
    0,
  );
  const accountWithPnl = account
    ? { ...account, totalUnrealizedProfit, currentBalance: Number(account.totalWalletBalance || 0) + totalUnrealizedProfit }
    : account;

  const applySnapshot = useCallback((snapshot) => {
    if (!snapshot || unmountedRef.current) return;
    if (snapshot.account) setAccount(snapshot.account);
    if (snapshot.positions) setPositions(mergeStoredRiskIntoPositions(snapshot.positions));
    if (snapshot.openOrders) setOpenOrders(snapshot.openOrders);
    setConnected(true);
    setError(null);
  }, []);

  const applyPatch = useCallback((patch) => {
    if (!patch || unmountedRef.current) return;

    if (patch.account) {
      setAccount((prev) => ({ ...(prev || {}), ...patch.account }));
    }

    if (Array.isArray(patch.positionChanges)) {
      setPositions((prev) => {
        const bySymbol = new Map(prev.map((position) => [position.symbol, position]));

        patch.positionChanges.forEach((change) => {
          if (change.type === 'removed') {
            bySymbol.delete(change.symbol);
            return;
          }

          bySymbol.set(change.symbol, normalizePosition(change.position));
        });

        return mergeStoredRiskIntoPositions(Array.from(bySymbol.values()));
      });
    } else if (Array.isArray(patch.positions)) {
      setPositions(mergeStoredRiskIntoPositions(patch.positions));
    }

    if (Array.isArray(patch.openOrderChanges)) {
      setOpenOrders((prev) => {
        const byId = new Map(prev.map((order) => [order.id, order]));

        patch.openOrderChanges.forEach((change) => {
          if (change.type === 'removed') {
            byId.delete(change.id);
            return;
          }

          byId.set(change.id, change.order);
        });

        return Array.from(byId.values());
      });
    } else if (Array.isArray(patch.openOrders)) {
      setOpenOrders(patch.openOrders);
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;

    let retries = 0;
    const connect = () => {
      if (unmountedRef.current) return;

      try {
        const source = new EventSource('/api/futures/stream');
        eventSourceRef.current = source;

        source.onopen = () => {
          if (!unmountedRef.current) {
            setConnected(true);
            setError(null);
            retries = 0;
          }
        };

        source.onmessage = (event) => {
          if (unmountedRef.current) return;

          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'snapshot') {
              applySnapshot(payload.data);
            } else if (payload.type === 'patch') {
              applyPatch(payload.data);
            } else if (payload.type === 'status') {
              if (payload.data?.connected === false) {
                setConnected(false);
              }
            }
          } catch {
            // Ignore malformed stream messages and keep the connection alive.
          }
        };

        source.onerror = () => {
          if (unmountedRef.current) return;
          setConnected(false);
          setError('Live backend stream disconnected');
          source.close();
          retries += 1;
          const delay = Math.min(1000 * (2 ** retries), 15000);
          reconnectTimerRef.current = setTimeout(connect, delay);
        };
      } catch (err) {
        if (!unmountedRef.current) {
          setError(err.message || 'Failed to connect to live backend stream');
          retries += 1;
          const delay = Math.min(1000 * (2 ** retries), 15000);
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      }
    };

    connect();

    return () => {
      unmountedRef.current = true;
      clearTimeout(reconnectTimerRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [applyPatch, applySnapshot]);

  return { account: accountWithPnl, positions, openOrders, connected, error };
}

export function useBinanceSpotStream({ initialData = null } = {}) {
  const [holdings, setHoldings] = useState(() => initialData?.holdings || []);
  const [totalValue, setTotalValue] = useState(() => initialData?.totalValue || 0);
  const [connected, setConnected] = useState(false);
  void initialData;

  return { holdings, totalValue, connected };
}
