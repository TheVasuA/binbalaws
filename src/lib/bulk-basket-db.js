// Redis-backed store of active Bulk Scalp baskets.
//
// A "basket" is a group of futures positions this app opened together via a
// bulk order, plus the aggregate auto-exit thresholds (target / stop in USDT).
// It is persisted server-side so a standalone watcher process on the VPS can
// monitor PnL and auto-exit 24/7 — independent of any open browser tab.
//
// Storage layout (Upstash Redis):
//   bulk:baskets            → Set of active basket ids
//   bulk:basket:<id>        → JSON of the basket record
//
// Each basket record:
//   {
//     id, createdAt, updatedAt,
//     side: 'LONG' | 'SHORT',
//     symbols: ['BTCUSDT', ...],       // legs this app opened
//     targetUsdt: number | null,       // close all when aggregate PnL >= +this
//     stopUsdt: number | null,         // close all when aggregate PnL <= -this
//     status: 'active' | 'closing' | 'closed',
//     armed: boolean,                  // false = watcher ignores it
//   }

import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SET_KEY = 'bulk:baskets';
const basketKey = (id) => `bulk:basket:${id}`;

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Register a new active basket. Returns the stored record.
export async function registerBasket({
  side,
  symbols,
  targetUsdt = null,
  stopUsdt = null,
  armed = true,
}) {
  const normalizedSide = String(side || '').toUpperCase();
  const legs = (Array.isArray(symbols) ? symbols : [])
    .map((s) => String(s || '').toUpperCase())
    .filter(Boolean);

  if (!['LONG', 'SHORT'].includes(normalizedSide) || legs.length === 0) {
    throw new Error('registerBasket requires a valid side and at least one symbol');
  }

  const now = new Date().toISOString();
  const record = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    side: normalizedSide,
    symbols: legs,
    targetUsdt: num(targetUsdt),
    stopUsdt: num(stopUsdt),
    status: 'active',
    armed: armed !== false,
  };

  await redis.set(basketKey(record.id), record);
  await redis.sadd(SET_KEY, record.id);
  return record;
}

// List all active basket records (skips ids whose payload is gone).
export async function listActiveBaskets() {
  const ids = await redis.smembers(SET_KEY);
  if (!Array.isArray(ids) || ids.length === 0) return [];

  const records = await Promise.all(
    ids.map(async (id) => {
      const rec = await redis.get(basketKey(id));
      if (!rec) {
        // Orphaned id — clean it out of the set.
        await redis.srem(SET_KEY, id);
        return null;
      }
      return rec;
    }),
  );

  return records.filter(Boolean);
}

export async function getBasket(id) {
  if (!id) return null;
  return redis.get(basketKey(id));
}

// Patch fields on a basket (e.g. update thresholds, arm/disarm, mark closing).
export async function updateBasket(id, patch = {}) {
  const rec = await redis.get(basketKey(id));
  if (!rec) return null;

  const next = {
    ...rec,
    ...patch,
    // Keep numeric fields coerced.
    ...(patch.targetUsdt !== undefined ? { targetUsdt: num(patch.targetUsdt) } : {}),
    ...(patch.stopUsdt !== undefined ? { stopUsdt: num(patch.stopUsdt) } : {}),
    updatedAt: new Date().toISOString(),
  };

  await redis.set(basketKey(id), next);
  return next;
}

// Remove a basket entirely (after it is closed).
export async function removeBasket(id) {
  if (!id) return;
  await redis.del(basketKey(id));
  await redis.srem(SET_KEY, id);
}

// Remove specific symbols from a basket. If none remain, the basket is deleted.
// Returns the updated record, or null if it was removed.
export async function removeSymbolsFromBasket(id, symbols) {
  const rec = await redis.get(basketKey(id));
  if (!rec) return null;

  const drop = new Set((symbols || []).map((s) => String(s || '').toUpperCase()));
  const remaining = (rec.symbols || []).filter((s) => !drop.has(s));

  if (remaining.length === 0) {
    await removeBasket(id);
    return null;
  }

  return updateBasket(id, { symbols: remaining });
}
