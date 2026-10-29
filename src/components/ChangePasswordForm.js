'use client';

import { useState } from 'react';

// Reusable "change password" form used both on the Settings lock screen and
// in the Settings → Security section. Requires the CURRENT password to set a
// new one. Calls /api/settings-auth { action: 'change' }.
export default function ChangePasswordForm({ onChanged }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    setMsg('');
    setOk(false);
    if (!cur || !next) {
      setMsg('Enter the current and the new password.');
      return;
    }
    if (next !== confirm) {
      setMsg('New passwords do not match.');
      return;
    }
    if (next.length < 4) {
      setMsg('New password must be at least 4 characters.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/settings-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change', currentPassword: cur, newPassword: next }),
      });
      const j = await res.json();
      if (j?.success) {
        // After a password change a fresh session token is issued — keep it so
        // settings writes keep working without re-unlocking.
        if (j.token) {
          try { sessionStorage.setItem('settingsToken', j.token); } catch {}
        }
        setMsg('Password changed successfully.');
        setOk(true);
        setCur('');
        setNext('');
        setConfirm('');
        onChanged?.();
      } else {
        setMsg(j?.error || 'Wrong current password');
      }
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="block text-sm text-gray-300 mb-1">Current password</label>
        <input
          type="password"
          value={cur}
          onChange={(e) => setCur(e.target.value)}
          autoComplete="current-password"
          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-300 mb-1">New password</label>
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-300 mb-1">Confirm new password</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        />
      </div>
      {msg && <p className={`text-sm ${ok ? 'text-green-400' : 'text-red-400'}`}>{msg}</p>}
      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium"
      >
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}
