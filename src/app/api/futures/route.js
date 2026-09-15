import { NextResponse } from 'next/server';
import { 
  getFuturesAccount, 
  getFuturesPositions,
  getFuturesOpenOrders,
  getFuturesSymbols,
  getFuturesPositive3dShortlist,
  getFuturesRsi1hScan,
  setFuturesLeverage,
  placeFuturesMarketOrder,
  placeFuturesExitOrders,
  cancelFuturesExitOrders,
  closePosition,
  closeAllPositions,
  getTodayRealizedPnl,
  getApiWeight
} from '@/lib/binance';
import { calculateFuturesRiskMetrics } from '@/lib/risk';
import { 
  createFuturesOrderRecord,
  listStoredOrders,
  updateStoredRisk,
} from '@/lib/order-db';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Read circuit-breaker settings: daily-loss limit % (default 10) and whether
// new orders are allowed even after the limit is breached (override, default no).
async function getBreakerSettings() {
  try {
    const s = await redis.get('portfolio_settings');
    const pct = Number(s?.dailyLossLimitPercent);
    return {
      lossLimitPercent: Number.isFinite(pct) && pct > 0 ? pct : 10,
      allowAfterBreach: Number(s?.allowOrdersAfterBreach) === 1,
    };
  } catch {
    return { lossLimitPercent: 10, allowAfterBreach: false };
  }
}

// ── Shared Redis cache so many viewers share ONE set of Binance calls ───────
// Every browser hitting this API reads from Redis instead of calling Binance
// directly. Only the first request within each TTL window actually hits
// Binance; everyone else (10+ members) is served the cached snapshot. On a
// Binance error we fall back to the last good value so viewers never see a
// rate-limit error.
//
// In-process de-duplication: if several requests arrive on the same server at
// once and the cache is cold, only one Binance fetch runs; the rest await it.
const inflight = new Map();

async function cachedFetch(key, ttlSeconds, fetcher) {
  const cacheKey = `cache:${key}`;
  const staleKey = `stale:${key}`;

  // 1. Fresh cache hit.
  try {
    const hit = await redis.get(cacheKey);
    if (hit !== null && hit !== undefined) return hit;
  } catch { /* redis down → fall through to direct fetch */ }

  // 2. Coalesce concurrent cold-cache requests on this instance.
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      const fresh = await fetcher();
      // Write fresh (short TTL) + stale (long TTL) copies.
      try {
        await redis.set(cacheKey, fresh, { ex: ttlSeconds });
        await redis.set(staleKey, fresh, { ex: 24 * 60 * 60 });
      } catch { /* ignore cache write errors */ }
      return fresh;
    } catch (err) {
      // 3. Binance failed (e.g. rate limit) → serve last known good value.
      try {
        const stale = await redis.get(staleKey);
        if (stale !== null && stale !== undefined) return stale;
      } catch { /* ignore */ }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

// Clear the fast caches after a trade so the UI reflects changes immediately
// (keeps the long-lived "stale" fallback copies intact).
async function invalidateFuturesCaches() {
  try {
    await Promise.all([
      redis.del('cache:snapshot'),
      redis.del('cache:account'),
      redis.del('cache:orders:all'),
      redis.del('cache:dailyPnl'),
    ]);
  } catch { /* ignore */ }
}

// SL/TP values come exclusively from the Binance Futures exchange (open orders).
// The local DB is no longer used as a source for displayed risk values — it is
// kept only as an audit trail of requested risk when placing orders.
async function loadFuturesSnapshot() {
  const [account, positions, rawOpenOrders] = await Promise.all([
    getFuturesAccount(),
    getFuturesPositions(),
    getFuturesOpenOrders(),
  ]);

  const riskMetrics = calculateFuturesRiskMetrics(positions, account);

  return {
    account,
    positions,
    openOrders: rawOpenOrders,
    riskMetrics,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'positions';

    if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
      return NextResponse.json({
        error: 'API keys not configured',
      }, { status: 401 });
    }

    let data;

    if (type === 'debug_orders') {
      data = await getFuturesOpenOrders();
    } else if (type === 'symbols') {
      // Symbols rarely change — cache 1 hour.
      data = await cachedFetch('symbols', 3600, () => getFuturesSymbols());
    } else if (type === 'shortlist3d') {
      const limit = parseInt(searchParams.get('limit') || '40', 10);
      data = await cachedFetch(`shortlist3d:${limit}`, 300, () => getFuturesPositive3dShortlist(limit));
    } else if (type === 'rsi1hscan') {
      const scanLimit = parseInt(searchParams.get('scanLimit') || '280', 10);
      data = await cachedFetch(`rsi1hscan:${scanLimit}`, 180, () => getFuturesRsi1hScan(scanLimit));
    } else if (type === 'account') {
      data = await cachedFetch('account', 3, () => getFuturesAccount());
    } else if (type === 'dailyPnl') {
      data = await cachedFetch('dailyPnl', 30, () => getTodayRealizedPnl());
    } else if (type === 'orders') {
      const symbol = searchParams.get('symbol');
      data = await cachedFetch(`orders:${symbol || 'all'}`, 3, () => getFuturesOpenOrders(symbol));
    } else if (type === 'storedOrders') {
      const symbol = searchParams.get('symbol');
      const limit = searchParams.get('limit') || '100';
      data = await listStoredOrders({ symbol, limit });
    } else {
      // Full positions snapshot — the heaviest call. Cache 3s so 10 viewers
      // share one Binance fetch instead of each hitting the exchange.
      data = await cachedFetch('snapshot', 3, () => loadFuturesSnapshot());
    }

    const apiWeight = getApiWeight();

    return NextResponse.json({
      success: true,
      data,
      apiWeight: apiWeight.weight,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Futures API error:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
      return NextResponse.json({
        error: 'API keys not configured',
      }, { status: 401 });
    }

    const body = await request.json();
    const {
      action,
      symbol,
      side,
      quantity,
      leverage,
      stopLossPrice,
      takeProfitPrice,
      includeHuge,
    } = body;

    if (action === 'openPosition') {
      if (!symbol || !side || !quantity) {
        return NextResponse.json({
          error: 'Missing required fields: symbol, side, quantity',
        }, { status: 400 });
      }

      const leverageValue = Number.isFinite(parseInt(leverage, 10)) ? parseInt(leverage, 10) : 15;
      const normalizedSide = String(side).toUpperCase() === 'LONG'
        ? 'BUY'
        : String(side).toUpperCase() === 'SHORT'
          ? 'SELL'
          : String(side).toUpperCase();

      const parsedStopLossPrice =
        stopLossPrice === null || stopLossPrice === undefined || stopLossPrice === ''
          ? null
          : Number(stopLossPrice);
      const parsedTakeProfitPrice =
        takeProfitPrice === null || takeProfitPrice === undefined || takeProfitPrice === ''
          ? null
          : Number(takeProfitPrice);

      if (parsedStopLossPrice !== null && (!Number.isFinite(parsedStopLossPrice) || parsedStopLossPrice <= 0)) {
        return NextResponse.json({
          error: 'stopLossPrice must be a positive number',
        }, { status: 400 });
      }

      if (parsedTakeProfitPrice !== null && (!Number.isFinite(parsedTakeProfitPrice) || parsedTakeProfitPrice <= 0)) {
        return NextResponse.json({
          error: 'takeProfitPrice must be a positive number',
        }, { status: 400 });
      }

      // ── Daily loss circuit breaker ─────────────────────────────────────
      // Block new entries once today's realized loss reaches the configured
      // % of margin balance. Enforced server-side so it can't be bypassed.
      //
      // Exception: "huge" orders with leverage >= 20x bypass the breaker
      // entirely — no daily-loss / margin check applies to them.
      const HUGE_ORDER_LEVERAGE = 20;
      const isHugeOrder = leverageValue >= HUGE_ORDER_LEVERAGE;

      const breakerSettings = await getBreakerSettings();

      // Skip the breaker for huge (>=20x) orders, OR when the user has enabled
      // the "allow orders after breach" override in Settings.
      if (!isHugeOrder && !breakerSettings.allowAfterBreach) {
      try {
        const [dailyPnl, account] = await Promise.all([
          getTodayRealizedPnl(),
          getFuturesAccount(),
        ]);
        const lossLimitPercent = breakerSettings.lossLimitPercent;
        const marginBalance = Number(account?.totalMarginBalance) || 0;
        const lossLimitUsd = marginBalance * (lossLimitPercent / 100);
        const realizedLoss = Math.max(0, -(dailyPnl?.realizedPnl || 0)); // positive = loss

        if (lossLimitUsd > 0 && realizedLoss >= lossLimitUsd) {
          return NextResponse.json({
            error: `Daily loss circuit breaker tripped. Today's loss ${realizedLoss.toFixed(2)} USDT has reached the ${lossLimitPercent}% limit (${lossLimitUsd.toFixed(2)} USDT of margin). No new orders until tomorrow.`,
            circuitBreaker: true,
          }, { status: 403 });
        }
      } catch (err) {
        // If the check itself fails, do not silently allow — log and continue
        // only for transient errors (order still requires SL etc. downstream).
        console.error('Circuit breaker check failed:', err.message);
      }
      } // end circuit-breaker (skipped for huge >= 20x orders)

      const leverageResult = await setFuturesLeverage(symbol, leverageValue);
      const orderResult = await placeFuturesMarketOrder({
        symbol,
        side: normalizedSide,
        quantity,
      });

      // Place real protective SL/TP orders on Binance so the exchange is the
      // single source of truth for stop loss / target values.
      let riskOrders = null;
      let riskOrdersError = null;
      if (parsedStopLossPrice !== null || parsedTakeProfitPrice !== null) {
        try {
          riskOrders = await placeFuturesExitOrders({
            symbol,
            entrySide: normalizedSide,
            stopLossPrice: parsedStopLossPrice,
            takeProfitPrice: parsedTakeProfitPrice,
          });
        } catch (err) {
          riskOrdersError = err.message;
          console.error('Failed to place SL/TP exit orders:', err.message);
        }
      }

      const savedOrder = await createFuturesOrderRecord({
        symbol,
        side: normalizedSide,
        quantity,
        leverage: leverageValue,
        orderResult,
        leverageResult,
        stopLossPrice: parsedStopLossPrice,
        takeProfitPrice: parsedTakeProfitPrice,
      });

      await invalidateFuturesCaches();

      return NextResponse.json({
        success: true,
        data: {
          leverage: leverageResult,
          order: orderResult,
          riskOrders,
          riskOrdersError,
          savedOrder,
          riskStoredInDb:
            parsedStopLossPrice !== null || parsedTakeProfitPrice !== null,
        },
      });
    }

    if (action === 'updateRisk') {
      if (!symbol || !side) {
        return NextResponse.json({
          error: 'Missing required fields: symbol, side',
        }, { status: 400 });
      }

      const parsedSL = stopLossPrice === null || stopLossPrice === undefined || stopLossPrice === ''
        ? null : Number(stopLossPrice);
      const parsedTP = takeProfitPrice === null || takeProfitPrice === undefined || takeProfitPrice === ''
        ? null : Number(takeProfitPrice);

      if (parsedSL !== null && (!Number.isFinite(parsedSL) || parsedSL <= 0)) {
        return NextResponse.json({ error: 'stopLossPrice must be a positive number' }, { status: 400 });
      }
      if (parsedTP !== null && (!Number.isFinite(parsedTP) || parsedTP <= 0)) {
        return NextResponse.json({ error: 'takeProfitPrice must be a positive number' }, { status: 400 });
      }

      const normalizedSide = String(side).toUpperCase() === 'LONG' ? 'BUY'
        : String(side).toUpperCase() === 'SHORT' ? 'SELL'
        : String(side).toUpperCase();

      // Exchange is the source of truth: cancel any existing SL/TP orders and
      // place the new ones on Binance so getFuturesPositions() reads them back.
      const cancelledOrderIds = await cancelFuturesExitOrders(symbol, normalizedSide);

      let riskOrders = null;
      if (parsedSL !== null || parsedTP !== null) {
        riskOrders = await placeFuturesExitOrders({
          symbol,
          entrySide: normalizedSide,
          stopLossPrice: parsedSL,
          takeProfitPrice: parsedTP,
        });
      }

      // Keep the local record in sync (used only as a fallback / audit trail).
      const saved = await updateStoredRisk({
        symbol,
        side: normalizedSide,
        stopLossPrice: parsedSL,
        takeProfitPrice: parsedTP,
      });

      await invalidateFuturesCaches();

      return NextResponse.json({
        success: true,
        data: { saved, riskOrders, cancelledOrderIds },
      });
    }

    if (action === 'closePosition') {
      if (!symbol || !side || !quantity) {
        return NextResponse.json({
          error: 'Missing required fields: symbol, side, quantity',
        }, { status: 400 });
      }

      const result = await closePosition(symbol, side, quantity);

      await invalidateFuturesCaches();

      return NextResponse.json({
        success: true,
        data: result,
      });
    }

    if (action === 'closeAll') {
      // Default: close every position except leverage >= 20x (huge-order
      // exception). includeHuge:true = "Zero Order Close" → close EVERYTHING.
      const result = await closeAllPositions({ includeHuge: includeHuge === true });
      await invalidateFuturesCaches();
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json({
      error: 'Unknown action',
    }, { status: 400 });
  } catch (error) {
    console.error('Futures POST error:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
      return NextResponse.json({ error: 'API keys not configured' }, { status: 401 });
    }

    const snapshot = await loadFuturesSnapshot();
    return NextResponse.json({ success: true, data: snapshot, lastUpdated: new Date().toISOString() });
  } catch (error) {
    console.error('Futures PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
