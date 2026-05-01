import { NextResponse } from 'next/server';
import { getFuturesAccount, getFuturesPositions, getFuturesOpenOrders } from '@/lib/binance';
import { getLatestStoredRiskByPosition } from '@/lib/order-db';

function getRiskValue({ side, entryPrice, positionAmt, triggerPrice }) {
  if (!Number.isFinite(triggerPrice)) {
    return null;
  }

  if (side === 'LONG') {
    return (triggerPrice - entryPrice) * positionAmt;
  }

  return (entryPrice - triggerPrice) * positionAmt;
}

function mergeStoredRiskIntoPositions(positions, storedRiskByPosition) {
  return positions.map((position) => {
    const normalizedSide = position.side === 'LONG' ? 'BUY' : 'SELL';
    const storedRisk = storedRiskByPosition[`${position.symbol}:${normalizedSide}`];

    if (!storedRisk) {
      return position;
    }

    const stopLossPrice = position.stopLossPrice ?? storedRisk.stopLossPrice ?? null;
    const takeProfitPrice = position.takeProfitPrice ?? storedRisk.takeProfitPrice ?? null;

    return {
      ...position,
      stopLossPrice,
      stopLossValue:
        position.stopLossValue ??
        getRiskValue({
          side: position.side,
          entryPrice: position.entryPrice,
          positionAmt: position.positionAmt,
          triggerPrice: stopLossPrice,
        }),
      takeProfitPrice,
      takeProfitValue:
        position.takeProfitValue ??
        getRiskValue({
          side: position.side,
          entryPrice: position.entryPrice,
          positionAmt: position.positionAmt,
          triggerPrice: takeProfitPrice,
        }),
    };
  });
}

async function getSnapshot() {
  const [account, positions, openOrders, storedRiskByPosition] = await Promise.all([
    getFuturesAccount(),
    getFuturesPositions(),
    getFuturesOpenOrders(),
    getLatestStoredRiskByPosition(),
  ]);

  return {
    account,
    positions: mergeStoredRiskIntoPositions(positions, storedRiskByPosition),
    openOrders,
  };
}

function diffSnapshots(previous, next) {
  if (!previous) {
    return next;
  }

  const previousPositions = new Map((previous.positions || []).map((position) => [position.symbol, position]));
  const nextPositions = new Map((next.positions || []).map((position) => [position.symbol, position]));
  const previousOrders = new Map((previous.openOrders || []).map((order) => [order.id, order]));
  const nextOrders = new Map((next.openOrders || []).map((order) => [order.id, order]));

  const positionChanges = [];
  const openPositionSymbols = [];
  const closedPositionSymbols = [];

  for (const [symbol, position] of nextPositions.entries()) {
    const previousPosition = previousPositions.get(symbol);
    if (!previousPosition) {
      positionChanges.push({ symbol, type: 'added', position });
      if (position.positionAmt !== 0) openPositionSymbols.push(symbol);
      continue;
    }

    if (JSON.stringify(previousPosition) !== JSON.stringify(position)) {
      positionChanges.push({ symbol, type: 'updated', position });
    }
  }

  for (const [symbol] of previousPositions.entries()) {
    if (!nextPositions.has(symbol)) {
      closedPositionSymbols.push(symbol);
      positionChanges.push({ symbol, type: 'removed' });
    }
  }

  const openOrderChanges = [];

  for (const [id, order] of nextOrders.entries()) {
    const previousOrder = previousOrders.get(id);
    if (!previousOrder) {
      openOrderChanges.push({ id, type: 'added', order });
      continue;
    }

    if (JSON.stringify(previousOrder) !== JSON.stringify(order)) {
      openOrderChanges.push({ id, type: 'updated', order });
    }
  }

  for (const [id] of previousOrders.entries()) {
    if (!nextOrders.has(id)) {
      openOrderChanges.push({ id, type: 'removed' });
    }
  }

  const accountChanged = JSON.stringify(previous.account) !== JSON.stringify(next.account);
  if (!positionChanges.length && !openOrderChanges.length && !accountChanged) {
    return null;
  }

  return {
    account: next.account,
    positionChanges,
    openOrderChanges,
    openPositionSymbols,
    closedPositionSymbols,
  };
}

export async function GET() {
  const encoder = new TextEncoder();
  let previousSnapshot = null;
  let interval = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const push = (payload) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        const snapshot = await getSnapshot();
        previousSnapshot = snapshot;
        push({ type: 'snapshot', data: snapshot });
      } catch (error) {
        push({ type: 'status', data: { connected: false, error: error.message } });
      }

      interval = setInterval(async () => {
        try {
          const nextSnapshot = await getSnapshot();
          const patch = diffSnapshots(previousSnapshot, nextSnapshot);
          previousSnapshot = nextSnapshot;

          if (patch) {
            push({ type: 'patch', data: patch });
          }
        } catch (error) {
          push({ type: 'status', data: { connected: false, error: error.message } });
        }
      }, 5000);

      push({ type: 'status', data: { connected: true } });
    },
    cancel() {
      closed = true;
      if (interval) clearInterval(interval);
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
