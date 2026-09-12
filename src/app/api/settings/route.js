import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KV_KEY = 'portfolio_settings';

// Defaults — kept in sync with src/lib/settings.js DEFAULT_SETTINGS.
const DEFAULTS = {
  goalTarget: 100000,      // USD target for the compound goal
  compoundPercent: 2,      // % gain aimed per trade
  defaultLeverage: 15,     // leverage pre-filled on new orders
  inrRate: 100,            // USD → INR multiplier used for PnL display
  maxLeverageWarn: 20,       // warn/flag when a position leverage is >= this
  riskPerTradePercent: 2,    // % of wallet risked per trade (SL sizing helper)
  maxOpenPositions: 3,       // max concurrent positions before a danger badge shows
  dailyLossLimitPercent: 10, // circuit breaker: block new orders once today's
                             // realized loss reaches this % of margin balance
  alarmLossPercent: 8,       // beep + alert when daily loss reaches this % of margin
};

export async function GET() {
  try {
    const data = await redis.get(KV_KEY);
    return NextResponse.json({ ...DEFAULTS, ...(data || {}) });
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json(DEFAULTS);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    // Whitelist + coerce to numbers so we never persist junk.
    const clean = {};
    for (const key of Object.keys(DEFAULTS)) {
      if (body[key] !== undefined && body[key] !== null && body[key] !== '') {
        const num = Number(body[key]);
        if (Number.isFinite(num)) clean[key] = num;
      }
    }

    const existing = (await redis.get(KV_KEY)) || {};
    const data = { ...DEFAULTS, ...existing, ...clean, updatedAt: new Date().toISOString() };

    await redis.set(KV_KEY, data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Settings POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await redis.del(KV_KEY);
    return NextResponse.json({ success: true, data: DEFAULTS });
  } catch (error) {
    console.error('Settings DELETE error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
