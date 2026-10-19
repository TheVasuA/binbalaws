// Base Balance Protection ("balance floor").
//
// The user sets a USD amount they refuse to lose (e.g. 5000). While positions
// are open, if the account equity — wallet balance + unrealized PnL, the big
// number shown in the dashboard header — touches or drops below that floor,
// EVERY position is force-closed (including 20x+) with no confirmation, long
// before Binance's own liquidation engine would act.
//
// The check runs in two places so it works with or without a browser open:
//   • the Futures page (client, on every live price tick)
//   • scripts/bulk-watcher.mjs (server-side, 24/7 on the VPS)
//
// This module is server-only (it talks to Redis); the client page has its own
// inline copy of the tiny breach rule.

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const SETTINGS_KEY = 'portfolio_settings';
const RATCHET_KEY = 'base_balance_ratchet';
const RATCHET_LOCK_KEY = 'base_balance_ratchet:lock';

// Coerce the stored setting to a positive number; anything else = disabled.
export function parseBaseBalance(settings) {
  const value = Number(settings?.baseBalance);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

// % of today's realized profit that is automatically added to the base
// balance (0 = off, capped at 100).
export function parseProfitToBasePercent(settings) {
  const value = Number(settings?.profitToBasePercent);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 100) : 0;
}

const round2 = (n) => Math.round(n * 100) / 100;

// Today's ratchet bookkeeping: { day, creditedPnl, addedToday, lastAdd, lastAddedAt }.
export async function getRatchetState() {
  try {
    return (await redis.get(RATCHET_KEY)) || null;
  } catch {
    return null;
  }
}

// ── Profit ratchet ───────────────────────────────────────────────────────────
// Credits `profitToBasePercent` % of today's realized profit to the base
// balance, so the floor rises as gains are banked (e.g. +$100 profit at 20% →
// base 5000 → 5020). Idempotent: today's realized PnL is tracked as a
// high-water mark, so each dollar of profit is credited exactly once — a dip
// and recovery within the day adds nothing until PnL exceeds the previous
// high. The day key is the income window start, so it resets at midnight
// together with getTodayRealizedPnl(). The base balance never decreases here.
//
// Safe to call from both the web server and the watcher: a short Redis lock
// prevents the two from crediting the same profit concurrently.
export async function applyProfitRatchet(dailyPnl) {
  const realized = Number(dailyPnl?.realizedPnl);
  const dayKey = String(dailyPnl?.startTime ?? '');
  if (!Number.isFinite(realized) || !dayKey) return null;

  let settings;
  try {
    settings = (await redis.get(SETTINGS_KEY)) || {};
  } catch {
    return null;
  }

  const baseBalance = parseBaseBalance(settings);
  const percent = parseProfitToBasePercent(settings);
  if (!(baseBalance > 0) || !(percent > 0)) {
    return { baseBalance, percent, applied: false, enabled: false };
  }

  let locked = false;
  try {
    locked = Boolean(await redis.set(RATCHET_LOCK_KEY, '1', { nx: true, ex: 10 }));
  } catch {
    locked = false;
  }
  if (!locked) return { baseBalance, percent, applied: false, enabled: true, busy: true };

  try {
    const prev = (await redis.get(RATCHET_KEY)) || {};
    const sameDay = String(prev.day) === dayKey;
    const credited = sameDay ? Math.max(Number(prev.creditedPnl) || 0, 0) : 0;
    const addedToday = sameDay ? Number(prev.addedToday) || 0 : 0;
    const now = new Date().toISOString();

    const delta = realized - credited;
    const add = delta > 0 ? round2(delta * (percent / 100)) : 0;

    // Nothing new to credit (or a sub-cent amount — leave it to accumulate).
    if (add <= 0) {
      if (!sameDay) {
        await redis.set(RATCHET_KEY, { day: dayKey, creditedPnl: 0, addedToday: 0, updatedAt: now });
      }
      return {
        baseBalance, percent, applied: false, enabled: true,
        creditedPnl: credited, addedToday,
        lastAdd: sameDay ? prev.lastAdd ?? null : null,
        lastAddedAt: sameDay ? prev.lastAddedAt ?? null : null,
      };
    }

    const nextBase = round2(baseBalance + add);
    await redis.set(SETTINGS_KEY, { ...settings, baseBalance: nextBase, updatedAt: now });

    const state = {
      day: dayKey,
      creditedPnl: realized,
      addedToday: round2(addedToday + add),
      lastAdd: add,
      lastAddedAt: now,
      updatedAt: now,
    };
    await redis.set(RATCHET_KEY, state);

    return {
      baseBalance: nextBase,
      previousBaseBalance: baseBalance,
      percent,
      applied: true,
      enabled: true,
      added: add,
      ...state,
    };
  } finally {
    try { await redis.del(RATCHET_LOCK_KEY); } catch { /* ignore */ }
  }
}

// Read the configured floor from the shared settings record (0 = disabled).
export async function getBaseBalanceSetting() {
  try {
    const settings = await redis.get(SETTINGS_KEY);
    return parseBaseBalance(settings);
  } catch {
    return 0;
  }
}

// Equity used for the comparison: wallet + unrealized PnL.
export function getEquity(account) {
  const margin = Number(account?.totalMarginBalance);
  if (Number.isFinite(margin)) return margin;
  const wallet = Number(account?.totalWalletBalance) || 0;
  const upnl = Number(account?.totalUnrealizedProfit) || 0;
  return wallet + upnl;
}

// True when the floor is set, positions are open, and equity <= floor.
export function isBaseBalanceBreached({ baseBalance, account, positions }) {
  if (!(baseBalance > 0)) return false;
  if (!Array.isArray(positions) || positions.length === 0) return false;
  const equity = getEquity(account);
  if (!Number.isFinite(equity)) return false;
  return equity <= baseBalance;
}
