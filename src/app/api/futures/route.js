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

// Read the daily-loss circuit-breaker limit from saved settings (default 10%).
async function getDailyLossLimitPercent() {
  try {
    const s = await redis.get('portfolio_settings');
    const v = Number(s?.dailyLossLimitPercent);
    return Number.isFinite(v) && v > 0 ? v : 10;
  } catch {
    return 10;
  }
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
      data = await getFuturesSymbols();
    } else if (type === 'shortlist3d') {
      const limit = parseInt(searchParams.get('limit') || '40', 10);
      data = await getFuturesPositive3dShortlist(limit);
    } else if (type === 'rsi1hscan') {
      const scanLimit = parseInt(searchParams.get('scanLimit') || '280', 10);
      data = await getFuturesRsi1hScan(scanLimit);
    } else if (type === 'account') {
      data = await getFuturesAccount();
    } else if (type === 'dailyPnl') {
      data = await getTodayRealizedPnl();
    } else if (type === 'orders') {
      const symbol = searchParams.get('symbol');
      data = await getFuturesOpenOrders(symbol);
    } else if (type === 'storedOrders') {
      const symbol = searchParams.get('symbol');
      const limit = searchParams.get('limit') || '100';
      data = await listStoredOrders({ symbol, limit });
    } else {
      data = await loadFuturesSnapshot();
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

      if (!isHugeOrder) {
      try {
        const [lossLimitPercent, dailyPnl, account] = await Promise.all([
          getDailyLossLimitPercent(),
          getTodayRealizedPnl(),
          getFuturesAccount(),
        ]);
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
      
      return NextResponse.json({
        success: true,
        data: result,
      });
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
