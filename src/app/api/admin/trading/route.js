import { NextResponse } from 'next/server';
import { requireAdmin, clientIp } from '@/lib/admin-guard';
import {
  getFuturesAccount,
  getFuturesPositions,
  getFuturesOpenOrders,
  getTodayRealizedPnl,
  closeAllPositions,
  closePosition,
  cancelFuturesOrder,
} from '@/lib/binance';
import { redis } from '@/lib/redis';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

async function invalidateCaches() {
  try {
    await redis.del('cache:snapshot', 'cache:account', 'cache:orders:all', 'cache:dailyPnl');
  } catch { /* cache is best-effort */ }
}

export async function GET(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const [account, positions, orders, dailyPnl] = await Promise.all([
      getFuturesAccount(),
      getFuturesPositions(),
      getFuturesOpenOrders(),
      getTodayRealizedPnl().catch(() => null),
    ]);
    return NextResponse.json({ account, positions, orders, dailyPnl, asOf: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}

export async function POST(request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const ip = clientIp(request);
  const body = await request.json().catch(() => ({}));

  try {
    switch (body.action) {
      case 'closeAll':
      case 'zeroClose': {
        const includeHuge = body.action === 'zeroClose';
        const result = await closeAllPositions({ includeHuge });
        await invalidateCaches();
        await recordAudit({
          action: `trading.${body.action}`,
          detail: `closed ${result.closed}, skipped ${result.skipped}, failed ${result.failed}`,
          ip,
        });
        return NextResponse.json(result);
      }

      case 'closePosition': {
        const { symbol, side, quantity } = body;
        if (!symbol || !side || !(Number(quantity) > 0)) {
          return NextResponse.json({ error: 'symbol, side and quantity are required' }, { status: 400 });
        }
        const result = await closePosition(symbol, side, Number(quantity));
        await invalidateCaches();
        await recordAudit({ action: 'trading.closePosition', detail: `${symbol} ${side} ${quantity}`, ip });
        return NextResponse.json(result);
      }

      case 'cancelEntryOrders': {
        // Resting entry orders only; reduce-only exits (SL/TP) are left alone.
        const orders = (await getFuturesOpenOrders()).filter((o) => !o.reduceOnly);
        const results = await Promise.allSettled(orders.map((o) => cancelFuturesOrder(o.symbol, o.id)));
        const cancelled = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.length - cancelled;
        await invalidateCaches();
        await recordAudit({ action: 'trading.cancelEntryOrders', detail: `cancelled ${cancelled}, failed ${failed}`, ip });
        return NextResponse.json({ cancelled, failed });
      }

      case 'cancelOrder': {
        if (!body.symbol || !body.orderId) {
          return NextResponse.json({ error: 'symbol and orderId are required' }, { status: 400 });
        }
        const result = await cancelFuturesOrder(body.symbol, body.orderId);
        await invalidateCaches();
        await recordAudit({ action: 'trading.cancelOrder', detail: `${body.symbol} #${body.orderId}`, ip });
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    await recordAudit({ action: `trading.${body.action}.failed`, detail: error.message, ip });
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
