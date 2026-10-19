#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Bulk Scalp — server-side auto-exit watcher.
//
// Runs as its own long-lived process on the VPS (via PM2 or systemd). Every
// few seconds it:
//   1. Reads all active baskets from Redis (registered by the app on bulkOpen).
//   2. Fetches live futures positions from Binance.
//   3. Sums the unrealized PnL of each basket's legs (matched by symbol+side).
//   4. If aggregate PnL >= +targetUsdt or <= -stopUsdt, closes every leg with a
//      reduce-only market order and clears the basket from Redis.
//
// Also enforces base balance floor, profit ratchet, and daily goal sync 24/7.
//
// Env required (same as the Next.js app — load via .env):
//   BINANCE_API_KEY, BINANCE_API_SECRET, BINANCE_TESTNET
//   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//
// Run:
//   node --env-file=.env scripts/bulk-watcher.mjs
// ─────────────────────────────────────────────────────────────────────────────

import {
  getFuturesPositions,
  getFuturesAccount,
  getTodayRealizedPnl,
  closePositionsBySymbols,
  closeAllPositions,
} from '../src/lib/binance.js';
import {
  listActiveBaskets,
  updateBasket,
  removeBasket,
  writeWatcherHeartbeat,
} from '../src/lib/bulk-basket-db.js';
import {
  getBaseBalanceSetting,
  getEquity,
  isBaseBalanceBreached,
  applyProfitRatchet,
} from '../src/lib/base-balance-guard.js';
import { syncCompoundGoalFromTodayPnl } from '../src/lib/daily-goal-sync.js';

const POLL_MS = Number(process.env.BULK_WATCHER_POLL_MS) || 3000;
const SETTINGS_REFRESH_MS = 15_000;
const RATCHET_INTERVAL_MS = Number(process.env.BULK_WATCHER_RATCHET_MS) || 30_000;

function log(...args) {
  console.log(new Date().toISOString(), '[bulk-watcher]', ...args);
}

let cachedBaseBalance = 0;
let cachedBaseBalanceAt = 0;

async function getBaseBalanceCached() {
  const now = Date.now();
  if (now - cachedBaseBalanceAt >= SETTINGS_REFRESH_MS) {
    const next = await getBaseBalanceSetting();
    if (next !== cachedBaseBalance) {
      log(next > 0
        ? `Base balance protection ON — floor ${next} USDT.`
        : 'Base balance protection OFF.');
    }
    cachedBaseBalance = next;
    cachedBaseBalanceAt = now;
  }
  return cachedBaseBalance;
}

let lastRatchetAt = 0;

async function profitRatchetTick(baseBalance) {
  if (!(baseBalance > 0)) return;
  const now = Date.now();
  if (now - lastRatchetAt < RATCHET_INTERVAL_MS) return;
  lastRatchetAt = now;

  let pnl;
  try {
    pnl = await getTodayRealizedPnl();
  } catch (err) {
    log('Profit ratchet: failed to fetch today PnL:', err.message);
    return;
  }

  try {
    const result = await applyProfitRatchet(pnl);
    if (result?.applied) {
      log(`PROFIT RATCHET: today's realized PnL ${Number(pnl.realizedPnl).toFixed(2)} → ` +
          `+${result.added} (${result.percent}%) → base balance ${result.previousBaseBalance} → ${result.baseBalance}.`);
      cachedBaseBalance = result.baseBalance;
    }
  } catch (err) {
    log('Profit ratchet failed:', err.message);
  }
}

let lastGoalSyncAt = 0;
const GOAL_SYNC_INTERVAL_MS = 30_000;

async function dailyGoalSyncTick() {
  const now = Date.now();
  if (now - lastGoalSyncAt < GOAL_SYNC_INTERVAL_MS) return;
  lastGoalSyncAt = now;

  let pnl;
  let account;
  try {
    [pnl, account] = await Promise.all([getTodayRealizedPnl(), getFuturesAccount()]);
  } catch (err) {
    log('Daily goal sync: failed to fetch PnL/account:', err.message);
    return;
  }

  try {
    const result = await syncCompoundGoalFromTodayPnl({ dailyPnl: pnl, account });
    if (result?.applied) {
      const extra = result.action === 'marked' ? `trade #${result.trade}` : 'auto mark reverted';
      log(
        `DAILY GOAL SYNC: ${result.action} (${extra}) — today net ${result.todayNet} vs target ${result.target}.`,
      );
    }
  } catch (err) {
    log('Daily goal sync failed:', err.message);
  }
}

async function baseBalanceTick(baseBalance, positions) {
  if (!(baseBalance > 0) || positions.length === 0) return false;

  let account;
  try {
    account = await getFuturesAccount();
  } catch (err) {
    log('Base guard: failed to fetch account:', err.message);
    return false;
  }

  if (!isBaseBalanceBreached({ baseBalance, account, positions })) return false;

  const equity = getEquity(account);
  log(`BASE BALANCE GUARD: equity ${equity.toFixed(2)} <= floor ${baseBalance}. ` +
      `Force-closing ALL ${positions.length} position(s) (incl. 20x+).`);
  try {
    const result = await closeAllPositions({ includeHuge: true });
    log(`Base guard closed: ${result.closed} ok, ${result.failed} failed.`);
  } catch (err) {
    log('Base guard close FAILED:', err.message);
  }
  return true;
}

function basketPnl(basket, positionsBySymbol) {
  let pnl = 0;
  const legs = [];
  for (const symbol of basket.symbols || []) {
    const pos = positionsBySymbol.get(symbol);
    if (!pos) continue;
    if (String(pos.side).toUpperCase() !== String(basket.side).toUpperCase()) continue;
    pnl += Number(pos.unrealizedProfit || 0);
    legs.push(symbol);
  }
  return { pnl, openLegs: legs };
}

async function tick() {
  try {
    await writeWatcherHeartbeat(POLL_MS);
  } catch (err) {
    log('Heartbeat write failed:', err.message);
  }

  await dailyGoalSyncTick();

  let baskets = [];
  try {
    baskets = (await listActiveBaskets()) || [];
  } catch (err) {
    log('Failed to read baskets from Redis:', err.message);
  }

  let baseBalance = 0;
  try {
    baseBalance = await getBaseBalanceCached();
  } catch (err) {
    log('Failed to read base balance setting:', err.message);
  }

  if (baskets.length === 0 && !(baseBalance > 0)) return;

  await profitRatchetTick(baseBalance);
  baseBalance = cachedBaseBalance || baseBalance;

  let positions;
  try {
    positions = await getFuturesPositions();
  } catch (err) {
    log('Failed to fetch positions from Binance:', err.message);
    return;
  }

  if (await baseBalanceTick(baseBalance, positions)) return;

  if (baskets.length === 0) return;

  const positionsBySymbol = new Map(positions.map((p) => [p.symbol, p]));

  for (const basket of baskets) {
    if (basket.status === 'closing') continue;
    if (basket.armed === false) continue;

    const { pnl, openLegs } = basketPnl(basket, positionsBySymbol);

    if (openLegs.length === 0) {
      log(`Basket ${basket.id} has no open legs left — removing.`);
      try { await removeBasket(basket.id); } catch { /* ignore */ }
      continue;
    }

    const target = Number(basket.targetUsdt);
    const stop = Number(basket.stopUsdt);
    const hitTarget = Number.isFinite(target) && target > 0 && pnl >= target;
    const hitStop = Number.isFinite(stop) && stop > 0 && pnl <= -stop;

    if (!hitTarget && !hitStop) continue;

    const reason = hitTarget
      ? `target +${target} reached (PnL ${pnl.toFixed(2)})`
      : `stop -${stop} hit (PnL ${pnl.toFixed(2)})`;
    log(`Basket ${basket.id} [${basket.side}] ${openLegs.join(',')} — ${reason}. Closing all.`);

    try { await updateBasket(basket.id, { status: 'closing' }); } catch { /* ignore */ }

    try {
      const result = await closePositionsBySymbols(openLegs);
      log(`Basket ${basket.id} closed: ${result.closed} ok, ${result.failed} failed.`);
      await removeBasket(basket.id);
    } catch (err) {
      log(`Basket ${basket.id} close FAILED:`, err.message);
      try { await updateBasket(basket.id, { status: 'active' }); } catch { /* ignore */ }
    }
  }
}

async function main() {
  if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
    log('FATAL: BINANCE_API_KEY / BINANCE_API_SECRET not set. Exiting.');
    process.exit(1);
  }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    log('FATAL: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set. Exiting.');
    process.exit(1);
  }

  log(`Started. Polling every ${POLL_MS}ms.`,
    process.env.BINANCE_TESTNET === 'true' ? '(TESTNET)' : '(LIVE)');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (err) {
      log('Unexpected tick error:', err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

process.on('SIGINT', () => { log('SIGINT — shutting down.'); process.exit(0); });
process.on('SIGTERM', () => { log('SIGTERM — shutting down.'); process.exit(0); });

main();
