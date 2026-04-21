import { NextResponse } from 'next/server';
import { 
  getFuturesAccount, 
  getFuturesPositions,
  getFuturesOpenOrders,
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
    const { action, symbol, side, quantity } = body;

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
