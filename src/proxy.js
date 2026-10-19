import { NextResponse } from 'next/server';
import { APP_AUTH_COOKIE, verifyAppSessionToken } from '@/lib/app-auth-session';
import { ADMIN_COOKIE, verifySessionToken as verifyAdminSession } from '@/lib/admin-auth';

const PUBLIC_APP_PATHS = new Set(['/login']);
const PUBLIC_ADMIN_PATHS = new Set(['/admin/login', '/api/admin/session']);

function isPublicAsset(pathname) {
  return (
    pathname.startsWith('/_next/')
    || pathname.startsWith('/favicon')
    || pathname === '/icon.png'
    || /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(pathname)
  );
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  if (isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  const appToken = request.cookies.get(APP_AUTH_COOKIE)?.value;
  const appAuthed = await verifyAppSessionToken(appToken);

  if (pathname === '/login') {
    if (appAuthed) {
      const next = request.nextUrl.searchParams.get('next') || '/';
      return NextResponse.redirect(new URL(next, request.url));
    }
    return NextResponse.next();
  }

  if (PUBLIC_APP_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (!appAuthed) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'App login required' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin/');
  if (isAdminRoute) {
    if (PUBLIC_ADMIN_PATHS.has(pathname)) {
      return NextResponse.next();
    }
    const adminSession = await verifyAdminSession(request.cookies.get(ADMIN_COOKIE)?.value);
    if (adminSession) {
      return NextResponse.next();
    }
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/admin/login';
    loginUrl.search = pathname === '/admin' ? '' : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
