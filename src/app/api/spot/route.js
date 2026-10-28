import { NextResponse } from 'next/server';
import { getAccountBalance } from '@/lib/binance';

export async function GET() {
  try {
    const balances = await getAccountBalance();
    const usdt = balances?.USDT?.total || 0;
    return NextResponse.json({ success: true, data: { totalValue: usdt, balances } });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
