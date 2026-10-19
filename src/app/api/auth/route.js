import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  APP_AUTH_COOKIE,
  verifyAppPassword,
  changeAppPassword,
  createAppSessionToken,
  isAppSessionAuthenticated,
  appAuthCookieOptions,
} from '@/lib/app-auth';

export async function GET() {
  const cookieStore = await cookies();
  const authenticated = await isAppSessionAuthenticated(cookieStore);
  return NextResponse.json({ authenticated });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = body?.action || 'verify';

    if (action === 'logout') {
      const res = NextResponse.json({ success: true });
      res.cookies.set(APP_AUTH_COOKIE, '', {
        ...appAuthCookieOptions(),
        maxAge: 0,
      });
      return res;
    }

    if (action === 'change') {
      const cookieStore = await cookies();
      if (!(await isAppSessionAuthenticated(cookieStore))) {
        return NextResponse.json(
          { success: false, error: 'App login required.' },
          { status: 401 },
        );
      }
      const result = await changeAppPassword(body.currentPassword, body.newPassword);
      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    const password = body?.password;
    const ok = await verifyAppPassword(password);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: 'Incorrect password.' },
        { status: 401 },
      );
    }

    const token = await createAppSessionToken();
    const res = NextResponse.json({ success: true, authenticated: true });
    res.cookies.set(APP_AUTH_COOKIE, token, appAuthCookieOptions());
    return res;
  } catch (error) {
    console.error('App auth error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Auth failed' },
      { status: 500 },
    );
  }
}
