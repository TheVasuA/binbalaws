import crypto from 'crypto';
import { Redis } from '@upstash/redis';
import {
  APP_AUTH_COOKIE,
  createAppSessionToken,
  verifyAppSessionToken,
  appAuthCookieOptions,
} from '@/lib/app-auth-session';

export {
  APP_AUTH_COOKIE,
  createAppSessionToken,
  verifyAppSessionToken,
  appAuthCookieOptions,
} from '@/lib/app-auth-session';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const REDIS_KEY = 'app_access_password';
const DEFAULT_PASSWORD = 'Bala@1234';

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

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

export async function ensureAppPasswordRecord() {
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

export async function verifyAppPassword(password) {
  const stored = (await ensureAppPasswordRecord()) || (await redis.get(REDIS_KEY));
  if (!stored) return false;
  return passwordsMatch(password, stored);
}

export async function changeAppPassword(currentPassword, newPassword) {
  const next = String(newPassword || '');
  if (next.length < 6) {
    return { ok: false, error: 'New password must be at least 6 characters.' };
  }
  const stored = await ensureAppPasswordRecord();
  if (!passwordsMatch(currentPassword, stored)) {
    return { ok: false, error: 'Current password is incorrect.' };
  }
  const updated = hashPassword(next);
  await redis.set(REDIS_KEY, updated);
  return { ok: true };
}

export async function isAppSessionAuthenticated(cookieStore) {
  const token = cookieStore?.get?.(APP_AUTH_COOKIE)?.value;
  return verifyAppSessionToken(token);
}
