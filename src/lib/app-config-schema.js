// Admin-controlled application config. Client-safe: no secrets live here.

export const FEATURE_PAGES = [
  { key: 'newOrder', label: 'New order', href: '/new-order' },
  { key: 'bulkOrder', label: 'Bulk scalp', href: '/bulk-order' },
  { key: 'markets', label: 'Markets', href: '/markets' },
  { key: 'goal', label: 'Goal', href: '/compound' },
  { key: 'history', label: 'History', href: '/trades' },
];

export const DEFAULT_APP_CONFIG = {
  brand: {
    name: '10M$',
  },
  trading: {
    enabled: true,
    limitOrdersEnabled: true,
    maxLeverage: 125,
    bulk: {
      enabled: true,
      minCoins: 3,
      maxCoins: 5,
      maxLeverage: 50,
    },
  },
  features: Object.fromEntries(FEATURE_PAGES.map((p) => [p.key, true])),
  maintenance: {
    enabled: false,
    message: 'The dashboard is down for maintenance. Open positions are unaffected.',
  },
  announcement: {
    enabled: false,
    tone: 'info',
    message: '',
  },
};

const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

const text = (value, fallback, maxLength) => {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLength);
};

/** Merge an untrusted patch onto a base config, coercing every field. */
export function sanitizeAppConfig(patch = {}, base = DEFAULT_APP_CONFIG) {
  const b = mergeAppConfigDefaults(base);
  const p = patch || {};
  const minCoins = clampInt(p.trading?.bulk?.minCoins, 1, 10, b.trading.bulk.minCoins);
  const maxCoins = clampInt(p.trading?.bulk?.maxCoins, 1, 10, b.trading.bulk.maxCoins);

  return {
    brand: {
      name: text(p.brand?.name, b.brand.name, 24) || DEFAULT_APP_CONFIG.brand.name,
    },
    trading: {
      enabled: bool(p.trading?.enabled, b.trading.enabled),
      limitOrdersEnabled: bool(p.trading?.limitOrdersEnabled, b.trading.limitOrdersEnabled),
      maxLeverage: clampInt(p.trading?.maxLeverage, 1, 125, b.trading.maxLeverage),
      bulk: {
        enabled: bool(p.trading?.bulk?.enabled, b.trading.bulk.enabled),
        minCoins: Math.min(minCoins, maxCoins),
        maxCoins: Math.max(minCoins, maxCoins),
        maxLeverage: clampInt(p.trading?.bulk?.maxLeverage, 1, 125, b.trading.bulk.maxLeverage),
      },
    },
    features: Object.fromEntries(
      FEATURE_PAGES.map((f) => [f.key, bool(p.features?.[f.key], b.features[f.key])]),
    ),
    maintenance: {
      enabled: bool(p.maintenance?.enabled, b.maintenance.enabled),
      message: text(p.maintenance?.message, b.maintenance.message, 280),
    },
    announcement: {
      enabled: bool(p.announcement?.enabled, b.announcement.enabled),
      tone: ['info', 'warn', 'danger'].includes(p.announcement?.tone) ? p.announcement.tone : b.announcement.tone,
      message: text(p.announcement?.message, b.announcement.message, 280),
    },
  };
}

/** Fill any keys missing from a stored config (older shape) with defaults. */
export function mergeAppConfigDefaults(stored) {
  const s = stored || {};
  const d = DEFAULT_APP_CONFIG;
  return {
    ...s,
    brand: { ...d.brand, ...s.brand },
    trading: {
      ...d.trading,
      ...s.trading,
      bulk: { ...d.trading.bulk, ...s.trading?.bulk },
    },
    features: { ...d.features, ...s.features },
    maintenance: { ...d.maintenance, ...s.maintenance },
    announcement: { ...d.announcement, ...s.announcement },
  };
}
