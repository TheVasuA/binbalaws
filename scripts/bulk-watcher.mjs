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
  closePositionsBySymbols,
} from '../src/lib/binance.js';
import {
  listActiveBaskets,
  updateBasket,
  removeBasket,
} from '../src/lib/bulk-basket-db.js';

const POLL_MS = Number(process.env.BULK_WATCHER_POLL_MS) || 3000;

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
    } catch (err) {
      log('Unexpected tick error:', err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

process.on('SIGINT', () => { log('SIGINT — shutting down.'); process.exit(0); });
process.on('SIGTERM', () => { log('SIGTERM — shutting down.'); process.exit(0); });

main();
