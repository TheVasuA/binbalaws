import { unstable_rethrow } from 'next/navigation';
import { redis, KEYS } from '@/lib/redis';
import { DEFAULT_APP_CONFIG, mergeAppConfigDefaults, sanitizeAppConfig } from '@/lib/app-config-schema';
import { withSettingsDefaults } from '@/lib/settings-schema';

// Order endpoints read the config on every request; a short in-process cache
// keeps that off the Redis hot path. Saves invalidate it immediately.
const TTL_MS = 5000;
let cached = null;
let cachedAt = 0;

export async function getAppConfig({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cachedAt < TTL_MS) return cached;
  try {
    const stored = await redis.get(KEYS.appConfig);
    cached = mergeAppConfigDefaults(stored);
  } catch (err) {
    unstable_rethrow(err);
    console.error('App config read failed:', err.message);
    cached = cached || mergeAppConfigDefaults(DEFAULT_APP_CONFIG);
  }
  cachedAt = Date.now();
  return cached;
}

export async function saveAppConfig(patch) {
  const current = await getAppConfig({ fresh: true });
  const next = { ...sanitizeAppConfig(patch, current), updatedAt: new Date().toISOString() };
  await redis.set(KEYS.appConfig, next);
  cached = next;
  cachedAt = Date.now();
  return next;
}

export async function getPortfolioSettings() {
  try {
    return withSettingsDefaults(await redis.get(KEYS.settings));
  } catch (err) {
    unstable_rethrow(err);
    console.error('Settings read failed:', err.message);
    return withSettingsDefaults(null);
  }
}

/**
 * Admin rules for opening new exposure. Returns null when allowed, otherwise
 * { status, error }. Closing or reducing positions is never gated here.
 */
export function checkEntryAllowed(config, { kind, leverage, orderType, legCount }) {
  if (config.maintenance.enabled) {
    return { status: 503, error: 'Trading is paused for maintenance.' };
  }
  if (!config.trading.enabled) {
    return { status: 403, error: 'New entries are disabled by the administrator.' };
  }
  const lev = Number(leverage);
  if (kind === 'single') {
    if (!config.features.newOrder) {
      return { status: 403, error: 'The order ticket is disabled by the administrator.' };
    }
    if (String(orderType || '').toUpperCase() === 'LIMIT' && !config.trading.limitOrdersEnabled) {
      return { status: 403, error: 'Limit orders are disabled by the administrator.' };
    }
    if (Number.isFinite(lev) && lev > config.trading.maxLeverage) {
      return { status: 400, error: `Leverage ${lev}x exceeds the ${config.trading.maxLeverage}x limit.` };
    }
  }
  if (kind === 'bulk') {
    const bulk = config.trading.bulk;
    if (!bulk.enabled || !config.features.bulkOrder) {
      return { status: 403, error: 'Bulk scalp is disabled by the administrator.' };
    }
    if (legCount < bulk.minCoins || legCount > bulk.maxCoins) {
      return { status: 400, error: `A basket must have ${bulk.minCoins}–${bulk.maxCoins} coins.` };
    }
    const cap = Math.min(bulk.maxLeverage, config.trading.maxLeverage);
    if (Number.isFinite(lev) && lev > cap) {
      return { status: 400, error: `Leverage ${lev}x exceeds the ${cap}x bulk limit.` };
    }
  }
  return null;
}
