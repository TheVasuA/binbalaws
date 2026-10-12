import { NextResponse } from 'next/server';
import { requireAdmin, clientIp } from '@/lib/admin-guard';
import { redis, KEYS } from '@/lib/redis';
import { listStoredOrders, countStoredOrders, clearStoredOrders } from '@/lib/order-db';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

async function scanKeys(pattern) {
  const keys = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, { match: pattern, count: 200 });
    keys.push(...batch);
    cursor = String(next);
  } while (cursor !== '0');
  return keys;
}

export async function GET(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const [compound, orders, orderCount, cacheKeys] = await Promise.all([
      redis.get(KEYS.compound),
      listStoredOrders({ limit: 50 }),
      countStoredOrders(),
      scanKeys('cache:*'),
    ]);
    return NextResponse.json({
      compound: compound || { startingBalance: null, completedTrades: [] },
      orders,
      orderCount,
      cacheKeys: cacheKeys.sort(),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const ip = clientIp(request);
  const body = await request.json().catch(() => ({}));

  try {
    switch (body.action) {
      case 'setCompound': {
        const current = (await redis.get(KEYS.compound)) || { completedTrades: [] };
        const balance = Number(body.startingBalance);
        if (!(balance > 0)) {
          return NextResponse.json({ error: 'Starting balance must be greater than zero.' }, { status: 400 });
        }
        const count = Math.max(0, Math.floor(Number(body.completedCount) || 0));
        const trades = (current.completedTrades || []).slice(0, count);
        while (trades.length < count) {
          trades.push({ trade: trades.length + 1, completedAt: new Date().toISOString(), setByAdmin: true });
        }
        const data = { startingBalance: balance, completedTrades: trades, updatedAt: new Date().toISOString() };
        await redis.set(KEYS.compound, data);
        await recordAudit({ action: 'goal.set', detail: `start ${balance}, completed ${count}`, ip });
        return NextResponse.json(data);
      }

      case 'resetCompound': {
        await redis.del(KEYS.compound);
        await recordAudit({ action: 'goal.reset', ip });
        return NextResponse.json({ ok: true });
      }

      case 'clearOrderLog': {
        const removed = await clearStoredOrders();
        await recordAudit({ action: 'orders.clearLog', detail: `${removed} records`, ip });
        return NextResponse.json({ removed });
      }

      case 'flushCache': {
        const keys = await scanKeys('cache:*');
        if (keys.length) await redis.del(...keys);
        await recordAudit({ action: 'cache.flush', detail: `${keys.length} keys`, ip });
        return NextResponse.json({ removed: keys.length });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
