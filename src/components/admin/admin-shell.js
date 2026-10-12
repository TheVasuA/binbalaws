'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { NotificationProvider } from '@/lib/notify';
import { Badge, Button, ConfirmProvider } from '@/components/ui';
import { IconArrowLeft, IconLogout, IconMenu, IconX } from '@/components/ui/icons';
import { BrandMark } from '@/components/shell/sidebar';
import { ThemeToggle } from '@/components/shell/topbar';
import { ADMIN_NAV, adminNavItemFor } from './admin-nav';

const SESSION_CHECK_MS = 60_000;

function useSessionWatch() {
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch('/api/admin/session', { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && !json.authenticated) {
          window.location.assign(`/admin/login?next=${encodeURIComponent(window.location.pathname)}`);
        }
      } catch { /* offline; try again later */ }
    };
    const id = setInterval(check, SESSION_CHECK_MS);
    window.addEventListener('focus', check);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', check);
    };
  }, []);
}

function AdminNav({ onNavigate }) {
  const pathname = usePathname();
  const active = adminNavItemFor(pathname);
  return (
    <nav className="space-y-0.5" aria-label="Admin">
      {ADMIN_NAV.map((item) => {
        const Icon = item.icon;
        const isActive = active?.href === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors',
              isActive ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            {isActive && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true" />}
            <Icon size={16} className={cn('shrink-0', isActive ? 'text-fg' : 'text-fg-subtle group-hover:text-fg-muted')} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ brand, onNavigate, onClose }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <Link href="/admin" onClick={onNavigate} className="flex min-w-0 items-center gap-2">
          <BrandMark name={brand} />
          <Badge tone="warn">Admin</Badge>
        </Link>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg" aria-label="Close menu">
            <IconX size={16} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <AdminNav onNavigate={onNavigate} />
      </div>
      <div className="border-t border-line p-3">
        <Link
          href="/"
          className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <IconArrowLeft size={16} className="text-fg-subtle" />
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

function SignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    try {
      await fetch('/api/admin/session', { method: 'DELETE' });
    } finally {
      router.replace('/admin/login');
      router.refresh();
    }
  };
  return (
    <Button variant="ghost" size="sm" onClick={signOut} loading={busy}>
      {!busy && <IconLogout size={15} />}
      <span className="hidden sm:inline">Sign out</span>
    </Button>
  );
}

export function AdminShell({ brand, children }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const current = adminNavItemFor(pathname);
  useSessionWatch();

  return (
    <NotificationProvider>
      <ConfirmProvider>
        <div className="min-h-dvh">
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] border-r border-line bg-surface lg:block">
            <SidebarBody brand={brand} />
          </aside>

          {menuOpen && (
            <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
              <div className="absolute inset-0 bg-[var(--overlay)]" onClick={() => setMenuOpen(false)} />
              <aside className="animate-dialog-in absolute inset-y-0 left-0 w-[260px] border-r border-line bg-surface shadow-pop">
                <SidebarBody brand={brand} onNavigate={() => setMenuOpen(false)} onClose={() => setMenuOpen(false)} />
              </aside>
            </div>
          )}

          <div className="flex min-h-dvh flex-col lg:pl-[232px]">
            <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur lg:px-6">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu">
                <IconMenu size={18} />
              </Button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-fg">{current?.label || 'Admin'}</p>
              </div>
              <ThemeToggle />
              <SignOut />
            </header>
            <main className="flex-1">{children}</main>
          </div>
        </div>
      </ConfirmProvider>
    </NotificationProvider>
  );
}
