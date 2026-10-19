// Auto mark / undo compound goal milestones from today's PnL.
//
// Uses the same rule as the Futures "Today's Target" bar:
//   target = wallet balance × compoundPercent / 100
//   todayNet = today's realized PnL + current unrealized PnL
//
// When todayNet >= target → mark the next milestone complete (once per crossing).
// When todayNet drops back below target → undo only if the last mark was auto today.

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const COMPOUND_KEY = 'compound_data';
const SETTINGS_KEY = 'portfolio_settings';
const SYNC_LOCK = 'daily_goal_sync:lock';

const round2 = (n) => Math.round(n * 100) / 100;

function milestoneForNextTrade(startingBalance, completedCount, compoundPercent) {
  let balance = Number(startingBalance) || 0;
  const rate = Number(compoundPercent) / 100;
  if (balance <= 0 || !Number.isFinite(rate) || rate <= 0) return null;

  for (let i = 0; i < completedCount; i += 1) {
    balance *= 1 + rate;
  }
  const profit = balance * rate;
  return {
    trade: completedCount + 1,
    startBalance: round2(balance),
    profit: round2(profit),
    endBalance: round2(balance + profit),
  };
}

export function computeTodayGoalTarget(walletBalance, compoundPercent) {
  const wallet = Number(walletBalance) || 0;
  const pct = Number(compoundPercent) || 0;
  if (wallet <= 0 || pct <= 0) return 0;
  return round2(wallet * (pct / 100));
}

export function computeTodayNetPnl(dailyPnl, account) {
  const realized = Number(dailyPnl?.realizedPnl) || 0;
  const upnl = Number(account?.totalUnrealizedProfit) || 0;
  return round2(realized + upnl);
}

export async function syncCompoundGoalFromTodayPnl({ dailyPnl, account }) {
  let settings;
  try {
    settings = (await redis.get(SETTINGS_KEY)) || {};
  } catch {
    return null;
  }

  if (Number(settings.autoDailyGoalSync) === 0) {
    return { enabled: false };
  }

  const compoundPercent = Number(settings.compoundPercent) || 2;
  const wallet = Number(account?.totalWalletBalance) || 0;
  const target = computeTodayGoalTarget(wallet, compoundPercent);
  const todayNet = computeTodayNetPnl(dailyPnl, account);
  const dayKey = String(dailyPnl?.startTime ?? '');

  if (target <= 0 || !dayKey) {
    return { enabled: true, applied: false, target, todayNet };
  }

  let locked = false;
  try {
    locked = Boolean(await redis.set(SYNC_LOCK, '1', { nx: true, ex: 8 }));
  } catch {
    locked = false;
  }
  if (!locked) return { enabled: true, applied: false, busy: true, target, todayNet };

  try {
    const compound = (await redis.get(COMPOUND_KEY)) || {
      startingBalance: null,
      completedTrades: [],
    };
    let startingBalance = Number(compound.startingBalance);
    if (!Number.isFinite(startingBalance) || startingBalance <= 0) {
      startingBalance = wallet;
    }

    const trades = Array.isArray(compound.completedTrades)
      ? [...compound.completedTrades]
      : [];
    const last = trades[trades.length - 1];
    const lastAutoToday = last?.source === 'auto' && String(last?.dayKey) === dayKey;
    const hitTarget = todayNet >= target;

    const now = new Date().toISOString();

    if (hitTarget && !lastAutoToday) {
      const milestone = milestoneForNextTrade(startingBalance, trades.length, compoundPercent);
      if (!milestone) {
        return { enabled: true, applied: false, target, todayNet };
      }

      trades.push({
        ...milestone,
        completedAt: now,
        source: 'auto',
        dayKey,
        todayNetAtMark: todayNet,
        targetUsd: target,
      });

      await redis.set(COMPOUND_KEY, {
        ...compound,
        startingBalance,
        completedTrades: trades,
        updatedAt: now,
      });

      return {
        enabled: true,
        applied: true,
        action: 'marked',
        trade: milestone.trade,
        target,
        todayNet,
        completedCount: trades.length,
      };
    }

    if (!hitTarget && lastAutoToday) {
      trades.pop();
      await redis.set(COMPOUND_KEY, {
        ...compound,
        startingBalance,
        completedTrades: trades,
        updatedAt: now,
      });

      return {
        enabled: true,
        applied: true,
        action: 'undone',
        target,
        todayNet,
        completedCount: trades.length,
      };
    }

    return {
      enabled: true,
      applied: false,
      target,
      todayNet,
      completedCount: trades.length,
      hitTarget,
    };
  } finally {
    try { await redis.del(SYNC_LOCK); } catch { /* ignore */ }
  }
}
