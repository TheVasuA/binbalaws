import { NextResponse } from 'next/server';
import { redis, KEYS } from '@/lib/redis';

const EMPTY = { startingBalance: null, completedTrades: [] };

export async function GET() {
  try {
    const data = await redis.get(KEYS.compound);
    return NextResponse.json(data || EMPTY);
  } catch (error) {
    console.error('Compound GET error:', error);
    return NextResponse.json(EMPTY);
  }
}

export async function POST(request) {
  try {
    const { startingBalance, completedTrades } = await request.json();
    const balance = Number(startingBalance);
    const data = {
      startingBalance: Number.isFinite(balance) && balance > 0 ? balance : null,
      completedTrades: Array.isArray(completedTrades) ? completedTrades.slice(0, 2000) : [],
      updatedAt: new Date().toISOString(),
    };
    await redis.set(KEYS.compound, data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Compound POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
