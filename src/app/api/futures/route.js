import { NextResponse } from 'next/server';
import { 
  getFuturesAccount, 
  getFuturesPositions,
  getFuturesOpenOrders,
  getFuturesSymbols,
  getFuturesPositive3dShortlist,
  getFuturesRsi1hScan,
  getFuturesTopGainers,
  setFuturesLeverage,
  placeFuturesMarketOrder,
  placeFuturesLimitOrder,
  placeBulkFuturesMarketOrders,
  closePositionsBySymbols,
  placeFuturesExitOrders,
  cancelFuturesExitOrders,
  cancelFuturesOrder,
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
import {
  registerBasket,
  listActiveBaskets,
  updateBasket,
  removeSymbolsFromBasket,
} from '@/lib/bulk-basket-db';
import {
  MAX_SL_CHANGES,
  getSlChanges,
  incrementSlChanges,
  resetSlChanges,
} from '@/lib/sl-lock-db';
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

  // Annotate each position with its SL-change allowance so the UI can lock the
  // stop-loss editor once the limit (set once + 2 modifications) is used up.
  const annotated = await Promise.all((positions || []).map(async (p) => {
    let slChanges = 0;
    try { slChanges = await getSlChanges(p.symbol, p.side); } catch { /* ignore */ }
    return {
      ...p,
      slChanges,
      slChangesRemaining: Math.max(0, MAX_SL_CHANGES - slChanges),
      slLocked: slChanges >= MAX_SL_CHANGES,
    };
  }));

  const riskMetrics = calculateFuturesRiskMetrics(annotated, account);

  return {
    account,
    positions: annotated,
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
    } else if (type === 'topgainers') {
      const limit = parseInt(searchParams.get('limit') || '60', 10);
      const minVol = parseInt(searchParams.get('minVol') || '20000000', 10);
      data = await cachedFetch(`topgainers:${limit}:${minVol}`, 60, () => getFuturesTopGainers({ limit, minQuoteVolume: minVol }));
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
    } else if (type === 'baskets') {
      // Active server-side bulk baskets (managed by the standalone watcher).
      data = await listActiveBaskets();
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
      orderType,      // 'MARKET' (default) or 'LIMIT'
      limitPrice,     // required when orderType === 'LIMIT'
      pricePrecision, // symbol price precision for rounding the limit price
      orderId,        // for cancelOrder
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

      // Entry order: MARKET (fills now) or LIMIT (rests at limitPrice).
      const normalizedOrderType = String(orderType || 'MARKET').toUpperCase();
      const isLimitEntry = normalizedOrderType === 'LIMIT';

      let orderResult;
      if (isLimitEntry) {
        const parsedLimitPrice = Number(limitPrice);
        if (!Number.isFinite(parsedLimitPrice) || parsedLimitPrice <= 0) {
          return NextResponse.json({ error: 'limitPrice must be a positive number for a LIMIT order' }, { status: 400 });
        }
        orderResult = await placeFuturesLimitOrder({
          symbol,
          side: normalizedSide,
          quantity,
          price: parsedLimitPrice,
          pricePrecision,
        });
      } else {
        orderResult = await placeFuturesMarketOrder({
          symbol,
          side: normalizedSide,
          quantity,
        });
      }

      // Place real protective SL/TP orders on Binance so the exchange is the
      // single source of truth. For LIMIT entries the position isn't open yet,
      // so closePosition SL/TP would be rejected — we store the requested risk
      // in the DB instead and skip placing exit orders until it fills.
      let riskOrders = null;
      let riskOrdersError = null;
      if (!isLimitEntry && (parsedStopLossPrice !== null || parsedTakeProfitPrice !== null)) {
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
      } else if (isLimitEntry && (parsedStopLossPrice !== null || parsedTakeProfitPrice !== null)) {
        riskOrdersError = 'SL/TP will be set after the limit order fills.';
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

      // Reset the SL-change counter for this fresh position so it starts with a
      // full allowance again. If an SL was placed at entry, that counts as the
      // first of the allowed writes.
      try {
        await resetSlChanges(symbol, side);
        if (!isLimitEntry && parsedStopLossPrice !== null) {
          await incrementSlChanges(symbol, side);
        }
      } catch (err) {
        console.error('[openPosition] Failed to reset SL change counter:', err.message);
      }

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

      // ── Stop-loss lock (set once + up to 2 modifications, then locked) ────
      // The exchange is the source of truth for the current SL. We also keep a
      // per-position counter in Redis of how many times the SL has been written.
      // The SL may be written up to MAX_SL_CHANGES times (initial set + 2
      // modifications). After that it locks: any attempt to change it is ignored
      // and the existing SL is re-placed as-is. The take-profit is always
      // editable. The counter resets when a new position is opened (see
      // openPosition → resetSlChanges).
      const sideUpper = String(side).toUpperCase();
      let existingSL = null;
      try {
        const positionsNow = await getFuturesPositions();
        const existing = (positionsNow || []).find(
          (p) => String(p.symbol).toUpperCase() === String(symbol).toUpperCase()
            && String(p.side).toUpperCase() === sideUpper,
        );
        existingSL = existing && Number(existing.stopLossPrice) > 0
          ? Number(existing.stopLossPrice)
          : null;
      } catch (err) {
        // If we can't verify the current SL, abort rather than risk the blind
        // cancel+replace below dropping an SL. Fail closed.
        console.error('[updateRisk] Could not verify existing SL; aborting:', err.message);
        return NextResponse.json({
          error: 'Could not verify the current stop loss. Try again — no changes were made.',
        }, { status: 503 });
      }

      const slChanges = await getSlChanges(symbol, sideUpper);
      const slLocked = slChanges >= MAX_SL_CHANGES;
      // A "change" is requested when the client sent an SL value that differs
      // from the one currently on the exchange.
      const slChangeRequested = parsedSL !== null
        && (existingSL === null || Number(parsedSL) !== existingSL);

      let effectiveSL = parsedSL;
      let willCountSlWrite = false;

      if (slLocked) {
        // Locked → keep the existing SL exactly, ignore any requested change.
        effectiveSL = existingSL;
        if (slChangeRequested) {
          console.warn(`[updateRisk] SL for ${symbol} ${sideUpper} is LOCKED after ${slChanges} changes; ignoring change to ${parsedSL}.`);
        }
      } else if (slChangeRequested) {
        // Allowed change within the limit → apply it and count this write.
        effectiveSL = parsedSL;
        willCountSlWrite = true;
      } else {
        // No SL change requested → preserve whatever is currently set so the
        // cancel+replace doesn't drop it.
        effectiveSL = existingSL;
      }

      // Exchange is the source of truth: cancel any existing SL/TP orders and
      // place the new ones on Binance so getFuturesPositions() reads them back.
      const cancelledOrderIds = await cancelFuturesExitOrders(symbol, normalizedSide);

      let riskOrders = null;
      if (effectiveSL !== null || parsedTP !== null) {
        riskOrders = await placeFuturesExitOrders({
          symbol,
          entrySide: normalizedSide,
          stopLossPrice: effectiveSL,
          takeProfitPrice: parsedTP,
        });
      }

      // Count this SL write only after it was placed successfully.
      let slChangesNow = slChanges;
      if (willCountSlWrite) {
        try { slChangesNow = await incrementSlChanges(symbol, sideUpper); } catch { /* ignore */ }
      }

      // Keep the local record in sync (used only as a fallback / audit trail).
      const saved = await updateStoredRisk({
        symbol,
        side: normalizedSide,
        stopLossPrice: effectiveSL,
        takeProfitPrice: parsedTP,
      });

      await invalidateFuturesCaches();

      return NextResponse.json({
        success: true,
        data: {
          saved,
          riskOrders,
          cancelledOrderIds,
          slChanges: slChangesNow,
          slChangesRemaining: Math.max(0, MAX_SL_CHANGES - slChangesNow),
          slLocked: slChangesNow >= MAX_SL_CHANGES,
        },
      });
    }

    if (action === 'closePosition') {
      if (!symbol || !side || !quantity) {
        return NextResponse.json({
          error: 'Missing required fields: symbol, side, quantity',
        }, { status: 400 });
      }

      // Optional limitPrice → reduce-only LIMIT exit; otherwise market close.
      const result = await closePosition(symbol, side, quantity, limitPrice);

      await invalidateFuturesCaches();

      return NextResponse.json({
        success: true,
        data: result,
      });
    }

    if (action === 'cancelOrder') {
      if (!symbol || orderId === undefined || orderId === null || orderId === '') {
        return NextResponse.json({
          error: 'Missing required fields: symbol, orderId',
        }, { status: 400 });
      }
      const result = await cancelFuturesOrder(symbol, orderId);
      await invalidateFuturesCaches();
      return NextResponse.json({ success: true, data: result });
    }

    if (action === 'bulkOpen') {
      // Open 3-5 futures legs in one shot. Body:
      //   { legs: [{ symbol, side, quantity, leverage }],
      //     targetUsdt, stopUsdt, armed }
      // Filled legs are registered as a server-side basket so the standalone
      // watcher can auto-exit them 24/7, independent of the browser.
      const legs = Array.isArray(body.legs) ? body.legs : [];
      if (legs.length < 1) {
        return NextResponse.json({ error: 'legs must contain at least one order' }, { status: 400 });
      }
      if (legs.length > 5) {
        return NextResponse.json({ error: 'A bulk scalp supports at most 5 coins' }, { status: 400 });
      }

      const result = await placeBulkFuturesMarketOrders(legs);
      await invalidateFuturesCaches();

      // Register the successfully-filled legs as a monitored basket.
      let basket = null;
      const filled = (result.results || []).filter((r) => r.ok);
      if (filled.length > 0) {
        try {
          const entrySide = String(filled[0].side || '').toUpperCase();
          const posSide = entrySide === 'BUY' ? 'LONG' : 'SHORT';
          basket = await registerBasket({
            side: posSide,
            symbols: filled.map((r) => r.symbol),
            targetUsdt: body.targetUsdt,
            stopUsdt: body.stopUsdt,
            armed: body.armed !== false,
          });
        } catch (err) {
          console.error('Failed to register bulk basket for server-side watch:', err.message);
        }
      }

      return NextResponse.json({ success: true, data: { ...result, basket } });
    }

    if (action === 'bulkClose') {
      // Close a specific set of positions in one shot. Body:
      //   { symbols: [...], basketId? }
      // Empty/absent symbols closes every open position. If basketId is given,
      // the closed symbols are removed from that server-side basket too.
      const symbols = Array.isArray(body.symbols) ? body.symbols : [];
      const result = await closePositionsBySymbols(symbols);
      await invalidateFuturesCaches();

      // Clear the closed symbols from the server-side basket, if provided.
      if (body.basketId) {
        try {
          await removeSymbolsFromBasket(body.basketId, symbols);
        } catch (err) {
          console.error('Failed to update basket after bulkClose:', err.message);
        }
      }

      return NextResponse.json({ success: true, data: result });
    }

    if (action === 'listBaskets') {
      const baskets = await listActiveBaskets();
      return NextResponse.json({ success: true, data: baskets });
    }

    if (action === 'updateBasket') {
      // Update thresholds / armed state on a server-side basket.
      // Body: { basketId, targetUsdt?, stopUsdt?, armed? }
      if (!body.basketId) {
        return NextResponse.json({ error: 'basketId is required' }, { status: 400 });
      }
      const patch = {};
      if (body.targetUsdt !== undefined) patch.targetUsdt = body.targetUsdt;
      if (body.stopUsdt !== undefined) patch.stopUsdt = body.stopUsdt;
      if (body.armed !== undefined) patch.armed = body.armed;
      const updated = await updateBasket(body.basketId, patch);
      return NextResponse.json({ success: true, data: updated });
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
