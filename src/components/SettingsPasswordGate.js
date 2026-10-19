'use client';

import { useState } from 'react';

export default function SettingsPasswordGate({ onUnlock }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/settings/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'verify', password }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Incorrect password.');
        return;
      }
      onUnlock?.();
    } catch {
      setError('Could not verify password. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-gray-800/80 border border-gray-700 rounded-2xl p-6 shadow-xl">
        <h1 className="text-xl font-bold text-white mb-1">Settings locked</h1>
        <p className="text-gray-500 text-sm mb-6">
          Enter your settings password to view and change portfolio options.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="settings-password" className="block text-sm text-gray-300 mb-1">
              Password
            </label>
            <input
              id="settings-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="Enter password"
              autoFocus
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
          >
            {submitting ? 'Checking…' : 'Unlock settings'}
          </button>
        </form>
      </div>
    </div>
  );
}
