import { NextResponse } from 'next/server';
import { getOpenOrders, getRecentTrades } from '@/lib/binance';
import { listStoredOrders } from '@/lib/order-db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'open';
    const symbol = searchParams.get('symbol');

    if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
      return NextResponse.json({
        error: 'API keys not configured',
      }, { status: 401 });
    }

    let data;
    if (type === 'stored') {
      const limit = searchParams.get('limit') || '100';
      data = await listStoredOrders({ symbol, limit });
    } else if (type === 'open' || type === 'pending') {
      data = await getOpenOrders(symbol);
    } else {
      data = await getRecentTrades(symbol || 'BTCUSDT');
    }

    return NextResponse.json({
      success: true,
      data,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Orders API error:', error);
    return NextResponse.json({
      error: error.message,
    }, { status: 500 });
  }
}
