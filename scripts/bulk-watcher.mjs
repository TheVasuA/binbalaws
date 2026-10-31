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
// This makes the auto-exit independent of any open browser tab — the whole
// point of running it on your own VPS.
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
  closePositionsBySymbols,
  closeAllPositions,
  replaceFuturesStopLoss,
} from '../src/lib/binance.js';
import {
  listActiveBaskets,
  updateBasket,
  removeBasket,
} from '../src/lib/bulk-basket-db.js';
import {
  listTrailingStops,
  updateTrailingRuntime,
  removeTrailingStop,
  computeTrailingSL,
} from '../src/lib/trailing-stop-db.js';
import { Redis } from '@upstash/redis';

const POLL_MS = Number(process.env.BULK_WATCHER_POLL_MS) || 3000;

// Portfolio settings live in Redis under this key — the same one the Next.js
// settings API reads/writes, so the dashboard and the watcher stay in sync.
const SETTINGS_KEY = 'portfolio_settings';
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function log(...args) {
  console.log(new Date().toISOString(), '[bulk-watcher]', ...args);
}

// Compute the aggregate unrealized PnL for a basket from the live positions.
// Matches by symbol AND side so a Binance-opened opposite position is ignored.
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
  let baskets;
  try {
    baskets = await listActiveBaskets();
  } catch (err) {
    log('Failed to read baskets from Redis:', err.message);
    return;
  }
  if (!baskets || baskets.length === 0) return;

  let positions;
  try {
    positions = await getFuturesPositions();
  } catch (err) {
    log('Failed to fetch positions from Binance:', err.message);
    return;
  }

  const positionsBySymbol = new Map(positions.map((p) => [p.symbol, p]));

  for (const basket of baskets) {
    if (basket.status === 'closing') continue; // already being closed
    if (basket.armed === false) continue;      // disarmed by the user

    const { pnl, openLegs } = basketPnl(basket, positionsBySymbol);

    // No legs of this basket are open anymore → nothing to manage, clean up.
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

    // Mark closing first so a slow close doesn't double-fire on the next tick.
    try { await updateBasket(basket.id, { status: 'closing' }); } catch { /* ignore */ }

    try {
      const result = await closePositionsBySymbols(openLegs);
      log(`Basket ${basket.id} closed: ${result.closed} ok, ${result.failed} failed.`);
      // Remove the basket regardless — any failed legs will be reconciled on the
      // next tick (they either stay open with no basket, or are already gone).
      await removeBasket(basket.id);
    } catch (err) {
      log(`Basket ${basket.id} close FAILED:`, err.message);
      // Re-arm so the next tick retries.
      try { await updateBasket(basket.id, { status: 'active' }); } catch { /* ignore */ }
    }
  }
}

// ── Base balance protection (overall portfolio floor) ───────────────────────
// Independent of baskets: if overall equity (wallet + live PnL) drops to the
// base balance floor, force-close EVERY running order (including 20x+). It
// reads the same portfolio_settings the dashboard uses, so the VPS protects
// the account 24/7 even when no browser tab is open.
async function baseBalanceTick() {
  let settings;
  try {
    settings = await redis.get(SETTINGS_KEY);
  } catch {
    // Redis hiccup is non-fatal for the watcher — skip this cycle.
    return;
  }

  const baseBalance = Number(settings?.baseBalance) || 0;
  const autoClose = Number(settings?.baseBalanceAutoClose) === 1;
  // baseBalance of 0 (or auto-close off) disables the floor.
  if (!(baseBalance > 0) || !autoClose) return;

  let account;
  try {
    account = await getFuturesAccount();
  } catch (err) {
    log('Base-balance check: failed to fetch account:', err.message);
    return;
  }
  const overall = Number(account?.totalMarginBalance) || 0;
  if (overall > baseBalance) return; // above the floor — nothing to do

  // At/below the floor: only act if there are actually open positions.
  let positions;
  try {
    positions = await getFuturesPositions();
  } catch (err) {
    log('Base-balance check: failed to fetch positions:', err.message);
    return;
  }
  const open = (positions || []).filter((p) => Math.abs(Number(p.positionAmt) || 0) > 0);
  if (open.length === 0) return;

  log(
    `Base balance reached: equity ${overall.toFixed(2)} <= ${baseBalance}. ` +
    `Force-closing all ${open.length} position(s) (includeHuge=true).`,
  );
  try {
    const result = await closeAllPositions({ includeHuge: true });
    log(
      `Base-balance close: ${result.closed} closed, ${result.skipped} skipped, ${result.failed} failed.`,
    );
  } catch (err) {
    log('Base-balance close FAILED:', err.message);
  }
}

// ── Auto-trailing stop ───────────────────────────────────────────────────────
// For each position with a trailing config, track the best (most favorable)
// mark price and keep the stop loss a fixed distance behind it. The stop only
// ever moves in the profit-locking direction (up for LONG, down for SHORT),
// never looser. Independent of the 3-change UI lock — this is an automated,
// risk-reducing adjustment.
// Only re-place the SL when it would move by a meaningful amount to avoid
// hammering the exchange on every tiny tick.
const TRAIL_MIN_STEP_FRAC = 0.0005; // 0.05% of price minimum move to act

async function trailingTick() {
  let configs;
  try {
    configs = await listTrailingStops();
  } catch (err) {
    log('Trailing: failed to read configs:', err.message);
    return;
  }
  if (!configs || configs.length === 0) return;

  let positions;
  try {
    positions = await getFuturesPositions();
  } catch (err) {
    log('Trailing: failed to fetch positions:', err.message);
    return;
  }
  const bySymbolSide = new Map(
    positions.map((p) => [`${p.symbol}:${String(p.side).toUpperCase()}`, p]),
  );

  for (const cfg of configs) {
    if (cfg.armed === false) continue;
    const key = `${cfg.symbol}:${cfg.side}`;
    const pos = bySymbolSide.get(key);

    // Position gone → trailing config is stale, remove it.
    if (!pos || Math.abs(Number(pos.positionAmt) || 0) <= 0) {
      try { await removeTrailingStop(cfg.symbol, cfg.side); } catch { /* ignore */ }
      continue;
    }

    const mark = Number(pos.markPrice);
    const entry = Number(pos.entryPrice);
    const qty = Math.abs(Number(pos.positionAmt));
    if (!(mark > 0) || !(entry > 0) || !(qty > 0)) continue;

    // Optional activation gate: only trail once the position is in profit by
    // at least activationProfit USDT.
    const pnl = cfg.side === 'LONG' ? (mark - entry) * qty : (entry - mark) * qty;
    if (Number(cfg.activationProfit) > 0 && pnl < Number(cfg.activationProfit)) {
      continue;
    }

    // Update the high-water mark (best favorable price seen).
    const prevPeak = Number(cfg.highWaterMark);
    const peak = cfg.side === 'LONG'
      ? Math.max(Number.isFinite(prevPeak) ? prevPeak : mark, mark)
      : Math.min(Number.isFinite(prevPeak) ? prevPeak : mark, mark);

    const desiredSL = computeTrailingSL({
      side: cfg.side, mode: cfg.mode, distance: cfg.distance, peak, qty,
    });
    if (!(desiredSL > 0)) {
      await updateTrailingRuntime(cfg.symbol, cfg.side, { highWaterMark: peak });
      continue;
    }

    // Never let the trailing stop sit past the current price (would trigger now).
    const safeSL = cfg.side === 'LONG' ? Math.min(desiredSL, mark * 0.999) : Math.max(desiredSL, mark * 1.001);

    // Only move the SL in the profit-locking direction and by a meaningful step.
    const lastSL = Number(cfg.lastSL);
    const hasLast = Number.isFinite(lastSL) && lastSL > 0;
    const improves = !hasLast || (cfg.side === 'LONG' ? safeSL > lastSL : safeSL < lastSL);
    const step = hasLast ? Math.abs(safeSL - lastSL) : Infinity;
    const meaningful = step >= mark * TRAIL_MIN_STEP_FRAC;

    if (improves && meaningful) {
      try {
        const entrySide = cfg.side === 'LONG' ? 'BUY' : 'SELL';
        const res = await replaceFuturesStopLoss({
          symbol: cfg.symbol, entrySide, stopLossPrice: safeSL,
        });
        log(`Trailing ${key}: SL → ${res.trigger} (peak ${peak}, mark ${mark}, PnL ${pnl.toFixed(2)}).`);
        await updateTrailingRuntime(cfg.symbol, cfg.side, { highWaterMark: peak, lastSL: res.trigger });
      } catch (err) {
        log(`Trailing ${key}: failed to move SL:`, err.message);
        await updateTrailingRuntime(cfg.symbol, cfg.side, { highWaterMark: peak });
      }
    } else {
      // Still record the new peak even if we didn't move the stop this tick.
      if (!Number.isFinite(prevPeak) || peak !== prevPeak) {
        await updateTrailingRuntime(cfg.symbol, cfg.side, { highWaterMark: peak });
      }
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

  // Simple sequential loop: never overlap ticks, and never crash the process
  // on a single failed cycle.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
      await baseBalanceTick();
      await trailingTick();
    } catch (err) {
      log('Unexpected tick error:', err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

process.on('SIGINT', () => { log('SIGINT — shutting down.'); process.exit(0); });
process.on('SIGTERM', () => { log('SIGTERM — shutting down.'); process.exit(0); });

main();
