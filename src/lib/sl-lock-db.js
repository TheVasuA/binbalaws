import { Redis } from '@upstash/redis';

// Tracks how many times a stop loss has been SET/CHANGED for the currently open
// position of a given symbol+side. The SL may be set once and modified a limited
// number of times, after which it locks. The counter is reset when a brand-new
// position is opened for that symbol+side (see resetSlChanges on openPosition).
//
// Storage: Redis hash-free simple keys, e.g. "sl_changes:BTCUSDT:LONG" -> number,
// with a 7-day TTL so stale counters for long-closed positions eventually clear.
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Max number of SL writes allowed per position: the first set + 2 modifications.
export const MAX_SL_CHANGES = 3;

const TTL_SECONDS = 7 * 24 * 60 * 60;

function key(symbol, side) {
  return `sl_changes:${String(symbol || '').toUpperCase()}:${String(side || '').toUpperCase()}`;
}

// How many times the SL has been set/changed for this position (0 if never).
export async function getSlChanges(symbol, side) {
  try {
    const v = await redis.get(key(symbol, side));
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    // On a Redis error, report 0 so a transient outage never bricks SL editing;
    // the route still refuses to drop an existing SL via its own guards.
    return 0;
  }
}

// Increment the counter after a successful SL write. Returns the new count.
export async function incrementSlChanges(symbol, side) {
  const k = key(symbol, side);
  const next = await redis.incr(k);
  try { await redis.expire(k, TTL_SECONDS); } catch { /* ignore */ }
  return next;
}

// Reset the counter — called when a new position is opened for this symbol+side
// so the fresh position starts with its full allowance of SL changes again.
export async function resetSlChanges(symbol, side) {
  try { await redis.del(key(symbol, side)); } catch { /* ignore */ }
}
