import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getRatchetState } from '@/lib/base-balance-guard';
import { isSettingsSessionAuthenticated } from '@/lib/settings-auth';

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
  autoCloseOnBreaker: 0,     // 1 = auto-close all positions (except >=20x) when
                             // the daily loss limit is hit; 0 = only block
  allowOrdersAfterBreach: 0, // 1 = allow new orders even after the daily loss
                             // limit is breached (override the circuit breaker)
  baseBalance: 0,            // USD floor to protect: when equity (wallet + uPnL)
                             // touches this, ALL positions are force-closed
                             // (including 20x+) with no confirmation. 0 = off
  profitToBasePercent: 20,   // % of today's realized profit automatically added
                             // to baseBalance (only while baseBalance > 0; 0 = off)
  requirePreOrderChecklist: 1, // 1 = futures Buy/Sell shows checklist before order
  autoDailyGoalSync: 1,        // 1 = auto mark/undo compound goal from today's PnL
};

// The dailyPnl cache embeds the current base balance (after the profit
// ratchet). Drop it whenever settings change so a new/disabled floor is seen
// by the Futures page right away instead of up to 30s later.
async function invalidateDailyPnlCache() {
  try { await redis.del('cache:dailyPnl'); } catch { /* ignore */ }
}

export async function GET() {
  try {
    const [data, ratchet] = await Promise.all([
      redis.get(KV_KEY),
      getRatchetState(),
    ]);
    return NextResponse.json({ ...DEFAULTS, ...(data || {}), baseBalanceRatchet: ratchet });
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json(DEFAULTS);
  }
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    if (!isSettingsSessionAuthenticated(cookieStore)) {
      return NextResponse.json(
        { success: false, error: 'Settings password required' },
        { status: 401 },
      );
    }

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
    await invalidateDailyPnlCache();
    const ratchet = await getRatchetState();
    return NextResponse.json({ success: true, data: { ...data, baseBalanceRatchet: ratchet } });
  } catch (error) {
    console.error('Settings POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    if (!isSettingsSessionAuthenticated(cookieStore)) {
      return NextResponse.json(
        { success: false, error: 'Settings password required' },
        { status: 401 },
      );
    }

    await redis.del(KV_KEY);
    await invalidateDailyPnlCache();
    return NextResponse.json({ success: true, data: DEFAULTS });
  } catch (error) {
    console.error('Settings DELETE error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
