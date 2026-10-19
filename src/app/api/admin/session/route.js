import { NextResponse } from 'next/server';
import {
  ADMIN_COOKIE,
  SESSION_TTL_SECONDS,
  checkPassword,
  createSessionToken,
  isAdminConfigured,
  verifySessionToken,
} from '@/lib/admin-auth';
import { clientIp } from '@/lib/admin-guard';
import { recordAudit } from '@/lib/audit';

// Brute-force throttle. The app runs as a single replica, so process memory is
// an adequate store.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map();

function throttled(ip) {
  const entry = attempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function registerFailure(ip) {
  const entry = attempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export async function GET(request) {
  const session = await verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value);
  return NextResponse.json({ configured: isAdminConfigured(), authenticated: !!session });
}

export async function POST(request) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: 'Admin access is not configured. Set ADMIN_PASSWORD (8+ characters) on the server.' },
      { status: 503 },
    );
  }

  const ip = clientIp(request);
  if (throttled(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
  }

  let password = '';
  try {
    ({ password } = await request.json());
  } catch { /* empty body */ }

  if (!(await checkPassword(password))) {
    registerFailure(ip);
    await recordAudit({ action: 'login.failed', ip });
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  attempts.delete(ip);
  await recordAudit({ action: 'login', ip });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}

export async function DELETE(request) {
  const session = await verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value);
  if (session) await recordAudit({ action: 'logout', ip: clientIp(request) });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
