import { NextResponse } from 'next/server';
import { APP_AUTH_COOKIE, verifyAppSessionToken } from '@/lib/app-auth-session';

const PUBLIC_PATHS = new Set(['/login']);

function isPublicAsset(pathname) {
  return (
    pathname.startsWith('/_next/')
    || pathname.startsWith('/favicon')
    || pathname === '/icon.png'
    || /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(pathname)
  );
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  const token = request.cookies.get(APP_AUTH_COOKIE)?.value;
  const authed = await verifyAppSessionToken(token);

  if (pathname === '/login') {
    if (authed) {
      const next = request.nextUrl.searchParams.get('next') || '/';
      return NextResponse.redirect(new URL(next, request.url));
    }
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (!authed) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'App login required' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('next', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
