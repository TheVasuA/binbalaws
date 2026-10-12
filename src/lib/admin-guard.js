import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/admin-auth';

function requestHost(request) {
  return request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
}

/**
 * Route-handler guard for /api/admin/*. The proxy already blocks anonymous
 * requests; this repeats the check so a matcher mistake can never expose an
 * admin endpoint, and rejects cross-site writes.
 * Returns a response to send back, or null when the request may proceed.
 */
export async function requireAdmin(request) {
  const session = await verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin) {
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch { /* malformed origin */ }
      if (originHost !== requestHost(request)) {
        return NextResponse.json({ error: 'Cross-site request rejected' }, { status: 403 });
      }
    }
  }
  return null;
}

export function clientIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
