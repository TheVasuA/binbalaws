// Browser-side wrapper for POST /api/futures actions. Throws with the server's
// error message so callers can surface it directly.
export async function futuresAction(action, payload = {}) {
  const res = await fetch('/api/futures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  let json = {};
  try {
    json = await res.json();
  } catch { /* non-JSON error page */ }
  if (!res.ok || json.success === false) {
    const err = new Error(json.error || `Request failed (${res.status})`);
    err.data = json;
    throw err;
  }
  return json.data ?? json;
}

/** Price at which a position gains/loses `usdt` (positive = gain). */
export function priceForPnl(position, usdt) {
  const qty = Math.abs(Number(position.positionAmt));
  const entry = Number(position.entryPrice);
  if (!qty || !entry) return null;
  const delta = usdt / qty;
  const p = position.side === 'LONG' ? entry + delta : entry - delta;
  return p > 0 ? p : null;
}

export function pnlAtPrice(position, price, qty = Math.abs(Number(position.positionAmt))) {
  const entry = Number(position.entryPrice);
  const diff = Number(price) - entry;
  return (position.side === 'LONG' ? diff : -diff) * qty;
}

export function positionMetrics(position) {
  const qty = Math.abs(Number(position.positionAmt)) || 0;
  const entry = Number(position.entryPrice) || 0;
  const mark = Number(position.markPrice) || entry;
  const leverage = Number(position.leverage) || 1;
  const notional = qty * mark;
  const margin = (qty * entry) / leverage;
  const pnl = Number(position.unrealizedProfit) || 0;
  return {
    qty,
    entry,
    mark,
    leverage,
    notional,
    margin,
    pnl,
    roe: margin > 0 ? (pnl / margin) * 100 : 0,
  };
}
