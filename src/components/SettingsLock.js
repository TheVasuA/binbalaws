'use client';

import { useState } from 'react';
import ChangePasswordForm from './ChangePasswordForm';

// Full-screen lock shown over the Settings page until the password is entered.
// Verifies server-side via /api/settings-auth. Also exposes a "change password"
// flow that requires the current password (so it works even while locked).
export default function SettingsLock({ onUnlock }) {
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showChange, setShowChange] = useState(false);

  const unlock = async (e) => {
    e?.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await fetch('/api/settings-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', password: pwd }),
      });
      const j = await res.json();
      if (j?.success) {
        setPwd('');
        onUnlock?.(j.token);
      } else {
        setErr(j?.error || 'Wrong password');
      }
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16 flex flex-col items-center">
      <div className="text-5xl mb-4">🔒</div>
      <h1 className="text-2xl font-bold text-white mb-1">Settings locked</h1>
      <p className="text-gray-400 text-sm mb-6 text-center">
        Enter the password to view and change settings.
      </p>

      <form onSubmit={unlock} className="w-full max-w-xs space-y-3">
        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          autoFocus
          placeholder="Password"
          autoComplete="current-password"
          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium"
        >
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>

      <button
        onClick={() => setShowChange((v) => !v)}
        className="mt-4 text-gray-400 hover:text-white text-xs underline"
      >
        {showChange ? 'Cancel change password' : 'Change password'}
      </button>

      {showChange && (
        <div className="w-full max-w-xs mt-4 bg-gray-800/50 border border-gray-700 rounded-xl p-4">
          <p className="text-gray-300 text-xs mb-3">
            Use your current password to set a new one.
          </p>
          <ChangePasswordForm />
        </div>
      )}
    </div>
  );
}
