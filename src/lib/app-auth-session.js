// Session tokens for app login — Web Crypto only (Edge middleware + Node API routes).

export const APP_AUTH_COOKIE = 'bala_app_auth';
export const APP_SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

export function appAuthSecret() {
  return (
    process.env.APP_AUTH_SECRET
    || process.env.SETTINGS_AUTH_SECRET
    || process.env.BINANCE_API_SECRET
    || 'bala-app-dev-secret'
  );
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacAppExp(exp) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;

  const enc = new TextEncoder();
  const key = await subtle.importKey(
    'raw',
    enc.encode(appAuthSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await subtle.sign('HMAC', key, enc.encode(`app:${exp}`));
  return base64UrlEncode(new Uint8Array(sig));
}

function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function createAppSessionToken() {
  const exp = Date.now() + APP_SESSION_MS;
  const sig = await hmacAppExp(exp);
  if (!sig) throw new Error('Web Crypto unavailable');
  return `${exp}.${sig}`;
}

export async function verifyAppSessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  const expected = await hmacAppExp(exp);
  if (!expected) return false;
  return timingSafeEqualStr(sig, expected);
}

export function appAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(APP_SESSION_MS / 1000),
  };
}
