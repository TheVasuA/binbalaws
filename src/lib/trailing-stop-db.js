import { Redis } from '@upstash/redis';

// Redis-backed store of per-position auto-trailing-stop configs. A standalone
// watcher (scripts/bulk-watcher.mjs) reads these every few seconds and ratchets
// the stop loss to stay a fixed distance behind the best price the position has
// reached — so profit is locked in automatically, 24/7, with no browser open.
//
// Storage layout (Upstash Redis):
//   trailing:index              → Set of active "SYMBOL:SIDE" keys
//   trailing:cfg:SYMBOL:SIDE    → JSON config record
//
// Config record:
//   {
//     symbol, side: 'LONG'|'SHORT',
//     mode: 'percent' | 'usdt',     // trail distance unit
//     distance: number,             // % (of price) or USDT behind the peak
//     activationProfit: number|0,   // only start trailing once PnL >= this USDT
//     highWaterMark: number|null,   // best (most favorable) mark price seen
//     lastSL: number|null,          // last SL trigger we set
//     armed: boolean,               // false = watcher ignores it
//     createdAt, updatedAt,
//   }
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const INDEX_KEY = 'trailing:index';
const cfgKey = (symbol, side) =>
  `trailing:cfg:${String(symbol || '').toUpperCase()}:${String(side || '').toUpperCase()}`;
const idOf = (symbol, side) =>
  `${String(symbol || '').toUpperCase()}:${String(side || '').toUpperCase()}`;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Create or update a trailing config for a position. Resets the high-water mark
// so trailing re-anchors from the current peak.
export async function setTrailingStop({ symbol, side, mode, distance, activationProfit = 0, armed = true }) {
  const normalizedSide = String(side || '').toUpperCase();
  const normalizedMode = mode === 'usdt' ? 'usdt' : 'percent';
  const dist = num(distance);
  if (!symbol || !['LONG', 'SHORT'].includes(normalizedSide)) {
    throw new Error('symbol and side (LONG/SHORT) are required');
  }
  if (!(dist > 0)) throw new Error('distance must be a positive number');

  const now = new Date().toISOString();
  const existing = await getTrailingStop(symbol, normalizedSide);
  const record = {
    symbol: String(symbol).toUpperCase(),
    side: normalizedSide,
    mode: normalizedMode,
    distance: dist,
    activationProfit: Math.max(0, num(activationProfit) || 0),
    highWaterMark: null, // re-anchor on (re)config
    lastSL: existing?.lastSL ?? null,
    armed: armed !== false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await redis.set(cfgKey(symbol, normalizedSide), record);
  await redis.sadd(INDEX_KEY, idOf(symbol, normalizedSide));
  return record;
}

export async function getTrailingStop(symbol, side) {
  try {
    return (await redis.get(cfgKey(symbol, side))) || null;
  } catch {
    return null;
  }
}

// Persist runtime updates (highWaterMark / lastSL) without touching config.
export async function updateTrailingRuntime(symbol, side, patch) {
  const cur = await getTrailingStop(symbol, side);
  if (!cur) return null;
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  await redis.set(cfgKey(symbol, side), next);
  return next;
}

export async function removeTrailingStop(symbol, side) {
  try {
    await redis.del(cfgKey(symbol, side));
    await redis.srem(INDEX_KEY, idOf(symbol, side));
  } catch { /* ignore */ }
}

export async function listTrailingStops() {
  try {
    const ids = await redis.smembers(INDEX_KEY);
    if (!ids || ids.length === 0) return [];
    const records = await Promise.all(
      ids.map((id) => {
        const [symbol, side] = id.split(':');
        return getTrailingStop(symbol, side);
      }),
    );
    return records.filter(Boolean);
  } catch {
    return [];
  }
}

// Pure helper (shared by the watcher): compute the desired SL trigger price
// from the peak/trough mark price and the trail distance.
//   percent → price offset = peak * distance%
//   usdt    → price offset = distance / qty  (USDT loss-back per unit)
// LONG: stop sits BELOW the peak; SHORT: stop sits ABOVE the trough.
export function computeTrailingSL({ side, mode, distance, peak, qty }) {
  const p = Number(peak);
  const d = Number(distance);
  if (!(p > 0) || !(d > 0)) return null;
  let off;
  if (mode === 'usdt') {
    const q = Math.abs(Number(qty));
    if (!(q > 0)) return null;
    off = d / q;
  } else {
    off = p * (d / 100);
  }
  if (!(off > 0)) return null;
  return side === 'LONG' ? p - off : p + off;
}
