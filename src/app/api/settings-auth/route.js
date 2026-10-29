import { NextResponse } from 'next/server';
import {
  getAuth,
  verifyPassword,
  setNewPassword,
  issueSession,
  revokeSession,
} from '@/lib/settings-auth';

// GET — reports whether a lock password exists (and seeds the default on first
// access). Never returns the hash.
export async function GET() {
  try {
    await getAuth();
    return NextResponse.json({ success: true, hasPassword: true });
  } catch (error) {
    console.error('settings-auth GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST actions:
//   verify { password }            → { success, token }   (issues a session token)
//   change { currentPassword, newPassword } → { success, token } (re-issues token)
//   logout { token }                → { success }          (revokes the session)
export async function POST(request) {
  try {
    const body = await request.json();
    const action = body?.action;

    if (action === 'verify') {
      const rec = await getAuth();
      if (!verifyPassword(body.password, rec)) {
        return NextResponse.json({ success: false, error: 'Wrong password' }, { status: 401 });
      }
      const token = await issueSession();
      return NextResponse.json({ success: true, token });
    }

    if (action === 'change') {
      const rec = await getAuth();
      if (!verifyPassword(body.currentPassword, rec)) {
        return NextResponse.json({ success: false, error: 'Current password is wrong' }, { status: 401 });
      }
      const newPassword = String(body.newPassword || '');
      if (newPassword.length < 4) {
        return NextResponse.json({ success: false, error: 'New password must be at least 4 characters' }, { status: 400 });
      }
      await setNewPassword(newPassword);
      // Re-issue a session so the user stays unlocked after changing the password.
      const token = await issueSession();
      return NextResponse.json({ success: true, token });
    }

    if (action === 'logout') {
      await revokeSession(body.token);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('settings-auth POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
