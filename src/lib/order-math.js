// Order sizing helpers shared by the order ticket and bulk scalp.

/** Round a raw quantity down to the symbol's step size / precision. */
export function normalizeOrderQuantity(rawQty, symbolInfo) {
  let quantity = Number(rawQty);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  const stepSize = Number(symbolInfo?.stepSize);
  if (Number.isFinite(stepSize) && stepSize > 0) {
    quantity = Math.floor(quantity / stepSize) * stepSize;
  }
  const quantityPrecision = symbolInfo?.quantityPrecision ?? 3;
  return Number(quantity.toFixed(quantityPrecision));
}

export function pricePrecisionOf(symbolInfo) {
  const parsed = parseInt(symbolInfo?.pricePrecision, 10);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(Math.max(parsed, 0), 8);
}

/**
 * Trigger price at which a new position of `quantity` gains (tp) or loses (sl)
 * `usdt`, measured from `entryPrice`. `side` is the order side (BUY/SELL).
 */
export function triggerPriceFromUsdt({ usdt, side, quantity, entryPrice, kind }) {
  const amount = Number(usdt);
  const qty = Number(quantity);
  const entry = Number(entryPrice);
  if (!(amount > 0) || !(qty > 0) || !(entry > 0)) return null;
  const delta = amount / qty;
  const up = (side === 'BUY') === (kind === 'tp');
  const price = up ? entry + delta : entry - delta;
  return price > 0 ? price : null;
}

// Binance USDT-M maintenance margin tiers (approximate).
export function maintenanceTier(notional) {
  const n = Number(notional);
  if (n < 50_000) return { mmr: 0.004, maintAmt: 0 };
  if (n < 250_000) return { mmr: 0.005, maintAmt: 50 };
  if (n < 1_000_000) return { mmr: 0.01, maintAmt: 1300 };
  if (n < 10_000_000) return { mmr: 0.025, maintAmt: 16300 };
  if (n < 20_000_000) return { mmr: 0.05, maintAmt: 266300 };
  return { mmr: 0.1, maintAmt: 1266300 };
}

/**
 * Cross-margin liquidation estimate: the price at which `balance` is wiped
 * by a position of `margin × leverage` opened at `entry`.
 */
export function estimateLiquidation({ entry, margin, leverage, balance, side }) {
  const ep = Number(entry);
  const lev = Number(leverage);
  const m = Number(margin);
  const bal = Number(balance);
  if (!(ep > 0) || !(lev > 0) || !(m > 0) || !(bal > 0)) return null;
  const { mmr } = maintenanceTier(m * lev);
  const balanceFactor = bal / (m * lev);
  if (side === 'BUY') {
    const liq = ep * (1 + mmr - balanceFactor);
    return liq > 0 && liq < ep ? liq : null;
  }
  const liq = ep * (1 - mmr + balanceFactor);
  return liq > ep ? liq : null;
}
