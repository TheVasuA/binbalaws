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
  closePosition,
  getApiWeight
} from '@/lib/binance';
import { calculateFuturesRiskMetrics } from '@/lib/risk';

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
      // Temporary debug: see raw open orders from Binance
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
    } else if (type === 'orders') {
      const symbol = searchParams.get('symbol');
      data = await getFuturesOpenOrders(symbol);
    } else {
      // Default: get positions with account info
      const [account, positions, rawOpenOrders] = await Promise.all([
        getFuturesAccount(),
        getFuturesPositions(),
        getFuturesOpenOrders()
      ]);
      const riskMetrics = calculateFuturesRiskMetrics(positions, account);
      
      data = {
        account,
        positions,
        riskMetrics,
        _debug_openOrders: rawOpenOrders,
      };
    }

    // Get current API weight
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
      pricePrecision,
    } = body;

    if (action === 'openPosition') {
      if (!symbol || !side || !quantity) {
        return NextResponse.json({
          error: 'Missing required fields: symbol, side, quantity',
        }, { status: 400 });
      }

      const leverageValue = Number.isFinite(parseInt(leverage, 10)) ? parseInt(leverage, 10) : 30;
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

      const leverageResult = await setFuturesLeverage(symbol, leverageValue);
      const orderResult = await placeFuturesMarketOrder({
        symbol,
        side: normalizedSide,
        quantity,
      });

      let riskOrders = null;
      let riskOrdersError = null;

      if (parsedStopLossPrice !== null || parsedTakeProfitPrice !== null) {
        try {
          riskOrders = await placeFuturesExitOrders({
            symbol,
            entrySide: normalizedSide,
            stopLossPrice: parsedStopLossPrice,
            takeProfitPrice: parsedTakeProfitPrice,
            pricePrecision,
          });
        } catch (riskError) {
          riskOrdersError = riskError.message;
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          leverage: leverageResult,
          order: orderResult,
          riskOrders,
          riskOrdersError,
        },
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
