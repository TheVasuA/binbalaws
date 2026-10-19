import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  SETTINGS_AUTH_COOKIE,
  verifySettingsPassword,
  changeSettingsPassword,
  createSettingsSessionToken,
  isSettingsSessionAuthenticated,
  settingsAuthCookieOptions,
} from '@/lib/settings-auth';

export async function GET() {
  const cookieStore = await cookies();
  const authenticated = isSettingsSessionAuthenticated(cookieStore);
  return NextResponse.json({ authenticated });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = body?.action || 'verify';

    if (action === 'logout') {
      const res = NextResponse.json({ success: true });
      res.cookies.set(SETTINGS_AUTH_COOKIE, '', {
        ...settingsAuthCookieOptions(),
        maxAge: 0,
      });
      return res;
    }

    if (action === 'change') {
      const cookieStore = await cookies();
      if (!isSettingsSessionAuthenticated(cookieStore)) {
        return NextResponse.json(
          { success: false, error: 'Unlock settings first.' },
          { status: 401 },
        );
      }
      const result = await changeSettingsPassword(body.currentPassword, body.newPassword);
      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true });
    }

    // verify (login)
    const password = body?.password;
    const ok = await verifySettingsPassword(password);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: 'Incorrect password.' },
        { status: 401 },
      );
    }

    const token = createSettingsSessionToken();
    const res = NextResponse.json({ success: true, authenticated: true });
    res.cookies.set(SETTINGS_AUTH_COOKIE, token, settingsAuthCookieOptions());
    return res;
  } catch (error) {
    console.error('Settings auth error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Auth failed' },
      { status: 500 },
    );
  }
}
