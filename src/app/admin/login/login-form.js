'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Callout, Field, Input } from '@/components/ui';
import { IconArrowLeft, IconLock } from '@/components/ui/icons';
import { BrandMark } from '@/components/shell/sidebar';

export function LoginForm({ brand, next, configured }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Sign in failed.');
      // Full navigation so the server layout sees the new cookie.
      window.location.assign(next);
    } catch (err) {
      setError(err.message);
      setPassword('');
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <BrandMark name={brand} />
        </div>

        <div className="rounded-lg border border-line bg-surface p-6">
          <div className="mb-5">
            <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight text-fg">
              <IconLock size={16} className="text-fg-muted" />
              Admin sign in
            </h1>
            <p className="mt-1 text-[13px] text-fg-muted">Controls trading limits, features and live positions.</p>
          </div>

          {!configured ? (
            <Callout tone="warn" title="Admin access is not set up">
              Set <code className="rounded bg-surface-3 px-1 text-xs">ADMIN_PASSWORD</code> (8 or more characters) in the server
              environment and restart the app.
            </Callout>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Field label="Password" error={error}>
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    autoComplete="current-password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={!!error}
                  />
                )}
              </Field>
              <Button type="submit" variant="primary" block loading={busy} disabled={!password}>
                Sign in
              </Button>
            </form>
          )}
        </div>

        <Link href="/" className="mt-6 flex items-center justify-center gap-1.5 text-[13px] text-fg-muted hover:text-fg">
          <IconArrowLeft size={14} />
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
