// Display formatting. Pure functions, safe on server and client.

const usdFormatters = new Map();

function usdFormatter(decimals) {
  if (!usdFormatters.has(decimals)) {
    usdFormatters.set(
      decimals,
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    );
  }
  return usdFormatters.get(decimals);
}

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** $1,234.56 */
export function usd(value, decimals = 2) {
  return usdFormatter(decimals).format(toNumber(value));
}

/** +$12.30 / −$4.10 (true minus sign so columns line up) */
export function signedUsd(value, decimals = 2) {
  const n = toNumber(value);
  if (n === 0) return usd(0, decimals);
  return `${n > 0 ? '+' : '−'}${usd(Math.abs(n), decimals)}`;
}

/** $1.2K, $3.4M */
export function compactUsd(value) {
  const n = toNumber(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: Math.abs(n) >= 1000 ? 1 : 2,
  }).format(n);
}

/** 1.25% / +1.25% with sign */
export function percent(value, { decimals = 2, signed = false } = {}) {
  const n = toNumber(value);
  const body = `${Math.abs(n).toFixed(decimals)}%`;
  if (!signed || n === 0) return n < 0 ? `−${body}` : body;
  return `${n > 0 ? '+' : '−'}${body}`;
}

/** Price with precision that follows magnitude (BTC 2dp, PEPE 8dp). */
export function price(value) {
  const n = toNumber(value);
  const abs = Math.abs(n);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 5 : 8;
  return n.toLocaleString('en-US', { minimumFractionDigits: Math.min(decimals, 2), maximumFractionDigits: decimals });
}

export function quantity(value) {
  const n = toNumber(value);
  return n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 2 : 6 });
}

/** ₹ amount from USD using the configured rate. */
export function inr(valueUsd, rate) {
  const n = toNumber(valueUsd) * toNumber(rate);
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function toneOf(value) {
  const n = toNumber(value);
  if (n > 0) return 'pos';
  if (n < 0) return 'neg';
  return 'muted';
}

export const TONE_TEXT = {
  pos: 'text-pos',
  neg: 'text-neg',
  warn: 'text-warn',
  muted: 'text-fg-muted',
  default: 'text-fg',
};

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function relativeTime(input, now = Date.now()) {
  const t = typeof input === 'number' ? input : Date.parse(input);
  if (!Number.isFinite(t)) return '—';
  const sec = Math.round((t - now) / 1000);
  const abs = Math.abs(sec);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
  return rtf.format(Math.round(sec / 86400), 'day');
}

export function dateTime(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function duration(seconds) {
  const s = Math.max(0, Math.round(toNumber(seconds)));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}
