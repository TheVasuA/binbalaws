import crypto from 'crypto';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const SETTINGS_AUTH_COOKIE = 'bala_settings_auth';
const REDIS_KEY = 'settings_access_password';
const DEFAULT_PASSWORD = 'Bala@1992';
const SESSION_MS = 12 * 60 * 60 * 1000;

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function authSecret() {
  return (
    process.env.SETTINGS_AUTH_SECRET
    || process.env.BINANCE_API_SECRET
    || 'bala-settings-dev-secret'
  );
}

function hashPassword(password, saltBase64) {
  const salt = saltBase64
    ? Buffer.from(saltBase64, 'base64')
    : crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64, SCRYPT_OPTS);
  return { salt: salt.toString('base64'), hash: hash.toString('base64') };
}

function passwordsMatch(password, stored) {
  if (!stored?.salt || !stored?.hash) return false;
  const salt = Buffer.from(stored.salt, 'base64');
  const derived = crypto.scryptSync(String(password), salt, 64, SCRYPT_OPTS);
  const expected = Buffer.from(stored.hash, 'base64');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export async function ensureSettingsPasswordRecord() {
  try {
    const existing = await redis.get(REDIS_KEY);
    if (existing?.salt && existing?.hash) return existing;
    const created = hashPassword(DEFAULT_PASSWORD);
    await redis.set(REDIS_KEY, created);
    return created;
  } catch {
    return null;
  }
}

export async function verifySettingsPassword(password) {
  const stored = (await ensureSettingsPasswordRecord()) || (await redis.get(REDIS_KEY));
  if (!stored) return false;
  return passwordsMatch(password, stored);
}

export async function changeSettingsPassword(currentPassword, newPassword) {
  const next = String(newPassword || '');
  if (next.length < 6) {
    return { ok: false, error: 'New password must be at least 6 characters.' };
  }
  const stored = await ensureSettingsPasswordRecord();
  if (!passwordsMatch(currentPassword, stored)) {
    return { ok: false, error: 'Current password is incorrect.' };
  }
  const updated = hashPassword(next);
  await redis.set(REDIS_KEY, updated);
  return { ok: true };
}

export function createSettingsSessionToken() {
  const exp = Date.now() + SESSION_MS;
  const sig = crypto
    .createHmac('sha256', authSecret())
    .update(String(exp))
    .digest('base64url');
  return `${exp}.${sig}`;
}

export function verifySettingsSessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = crypto
    .createHmac('sha256', authSecret())
    .update(String(exp))
    .digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isSettingsSessionAuthenticated(cookieStore) {
  const token = cookieStore?.get?.(SETTINGS_AUTH_COOKIE)?.value;
  return verifySettingsSessionToken(token);
}

export function settingsAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_MS / 1000),
  };
}
