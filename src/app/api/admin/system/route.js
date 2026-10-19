import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { redis } from '@/lib/redis';
import { getApiWeight } from '@/lib/binance';
import { listActiveBaskets, readWatcherHeartbeat } from '@/lib/bulk-basket-db';
import { countStoredOrders } from '@/lib/order-db';

export const dynamic = 'force-dynamic';

const BINANCE_LIMIT_WEIGHT = 2400;

async function timed(fn) {
  const start = performance.now();
  try {
    const value = await fn();
    return { ok: true, ms: Math.round(performance.now() - start), value };
  } catch (error) {
    return { ok: false, ms: Math.round(performance.now() - start), error: error.message };
  }
}

async function binanceTime() {
  const base = process.env.BINANCE_TESTNET === 'true'
    ? 'https://testnet.binancefuture.com'
    : 'https://fapi.binance.com';
  const res = await fetch(`${base}/fapi/v1/time`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { serverTime } = await res.json();
  return serverTime;
}

export async function GET(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const [redisCheck, binanceCheck, heartbeat, baskets, orderCount] = await Promise.all([
    timed(() => redis.ping()),
    timed(binanceTime),
    readWatcherHeartbeat().catch(() => null),
    listActiveBaskets().catch(() => []),
    countStoredOrders().catch(() => null),
  ]);

  const memory = process.memoryUsage();
  const weight = getApiWeight();

  return NextResponse.json({
    now: new Date().toISOString(),
    services: {
      redis: { ok: redisCheck.ok, latencyMs: redisCheck.ms, error: redisCheck.error },
      binance: {
        ok: binanceCheck.ok,
        latencyMs: binanceCheck.ms,
        error: binanceCheck.error,
        clockDriftMs: binanceCheck.ok ? Date.now() - binanceCheck.value : null,
        testnet: process.env.BINANCE_TESTNET === 'true',
        credentials: !!(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET),
      },
      watcher: {
        ok: !!heartbeat,
        lastSeen: heartbeat?.at ?? null,
        pollMs: heartbeat?.pollMs ?? null,
      },
    },
    apiWeight: { used: weight.weight, limit: BINANCE_LIMIT_WEIGHT, updatedAt: weight.updatedAt },
    baskets: { active: baskets.length, armed: baskets.filter((b) => b.armed).length },
    storedOrders: orderCount,
    process: {
      node: process.version,
      env: process.env.NODE_ENV,
      uptimeSec: Math.round(process.uptime()),
      rssMb: Math.round(memory.rss / 1048576),
      heapMb: Math.round(memory.heapUsed / 1048576),
    },
    security: {
      sessionSecretSet: !!process.env.ADMIN_SESSION_SECRET,
    },
  });
}
