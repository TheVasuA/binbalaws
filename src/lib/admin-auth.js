// Admin session tokens. Uses Web Crypto only so it runs in the proxy and in
// route handlers alike.
//
// Token format: base64url(JSON payload) + "." + base64url(HMAC-SHA256)

export const ADMIN_COOKIE = 'bala_admin';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

const encoder = new TextEncoder();

export function isAdminConfigured() {
  return typeof process.env.ADMIN_PASSWORD === 'string' && process.env.ADMIN_PASSWORD.length >= 8;
}

// The signing secret defaults to one derived from the password, so changing
// ADMIN_PASSWORD invalidates every existing session.
function secretMaterial() {
  return process.env.ADMIN_SESSION_SECRET || `admin-session:${process.env.ADMIN_PASSWORD || ''}`;
}

async function hmacKey() {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secretMaterial()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toBase64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function createSessionToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = toBase64Url(encoder.encode(JSON.stringify({ iat: now, exp: now + SESSION_TTL_SECONDS })));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(payload)));
  return `${payload}.${toBase64Url(signature)}`;
}

/** Returns the session payload when the token is authentic and unexpired. */
export async function verifySessionToken(token) {
  if (!isAdminConfigured() || typeof token !== 'string') return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(),
      fromBase64Url(signature),
      encoder.encode(payload),
    );
    if (!valid) return null;
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (!Number.isFinite(data.exp) || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

/** Constant-time password check (compares SHA-256 digests via HMAC verify). */
export async function checkPassword(candidate) {
  if (!isAdminConfigured() || typeof candidate !== 'string') return false;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode('admin-password-check'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(process.env.ADMIN_PASSWORD));
  return crypto.subtle.verify('HMAC', key, expected, encoder.encode(candidate));
}
