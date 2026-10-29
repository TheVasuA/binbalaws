import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { Redis } from '@upstash/redis';

// Server-side auth + session logic for the Settings lock. The password is never
// stored in plaintext or returned to the client — only a salted scrypt hash is
// kept, in a Redis key separate from portfolio_settings. Writes to settings
// require a short-lived session token issued at unlock, so the lock protects
// the API too, not just the UI.
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const AUTH_KEY = 'settings_auth';
const SESSION_PREFIX = 'settings_session:';
const SESSION_TTL = 8 * 60 * 60; // 8 hours

// Initial password seeded the first time the lock is accessed. Change it from
// the Settings → Security screen right after first login.
const DEFAULT_PASSWORD = 'Bala@1994';

function deriveHash(password, saltHex) {
  return scryptSync(String(password || ''), saltHex, 64);
}

// Load the auth record, seeding the default password on first ever access so
// the user can log in with Bala@1994 and then change it.
export async function getAuth() {
  const rec = await redis.get(AUTH_KEY);
  if (rec && rec.salt && rec.hash) return rec;

  const salt = randomBytes(16).toString('hex');
  const hashHex = deriveHash(DEFAULT_PASSWORD, salt).toString('hex');
  const seeded = { salt, hash: hashHex, createdAt: new Date().toISOString() };
  try { await redis.set(AUTH_KEY, seeded); } catch { /* ignore write error */ }
  return seeded;
}

export function verifyPassword(password, rec) {
  const computed = deriveHash(password, rec.salt);
  const stored = Buffer.from(rec.hash, 'hex');
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}

export async function setNewPassword(newPassword) {
  const salt = randomBytes(16).toString('hex');
  const hashHex = deriveHash(newPassword, salt).toString('hex');
  await redis.set(AUTH_KEY, { salt, hash: hashHex, updatedAt: new Date().toISOString() });
}

// Issue a short-lived session token (Redis-backed with a TTL). The client sends
// it with settings write requests; /api/settings validates it so writes are
// only allowed while unlocked.
export async function issueSession() {
  const token = randomBytes(32).toString('hex');
  await redis.set(SESSION_PREFIX + token, { createdAt: new Date().toISOString() }, { ex: SESSION_TTL });
  return token;
}

export async function verifySession(token) {
  if (!token || typeof token !== 'string') return false;
  try {
    const v = await redis.get(SESSION_PREFIX + token);
    return !!v;
  } catch {
    return false;
  }
}

export async function revokeSession(token) {
  if (!token) return;
  try { await redis.del(SESSION_PREFIX + token); } catch { /* ignore */ }
}
