import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN });
const KEY = 'profit_protection_config';

export async function GET() {
  const data = (await redis.get(KEY)) || { enabled: false, ordersTotal: 5, profitPercent: 2, manualSL: true };
  return NextResponse.json({ success: true, data });
}

export async function POST(request) {
  const body = await request.json();
  const data = { enabled: !!body.enabled, ordersTotal: Number(body.ordersTotal) || 5, profitPercent: Number(body.profitPercent) || 2, manualSL: body.manualSL !== false, updatedAt: new Date().toISOString() };
  await redis.set(KEY, data);
  return NextResponse.json({ success: true, data });
}
