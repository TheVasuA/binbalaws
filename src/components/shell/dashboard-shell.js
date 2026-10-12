'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { NotificationProvider } from '@/lib/notify';
import { ButtonLink, ConfirmProvider, EmptyState } from '@/components/ui';
import { IconAlert, IconInfo, IconLock, IconXCircle } from '@/components/ui/icons';
import { AppDataProvider, useAppConfig } from '@/components/providers/app-data';
import { FuturesStreamProvider } from '@/components/providers/futures-stream';
import { Sidebar, MobileSidebar } from './sidebar';
import { Topbar } from './topbar';
import { RiskAlerts } from './risk-alerts';
import { navItemFor } from './nav';
import { MaintenanceScreen } from './maintenance';

const COLLAPSE_KEY = 'app_sidebar_collapsed';
const COLLAPSE_EVENT = 'app-sidebar-change';

function subscribeCollapsed(callback) {
  window.addEventListener(COLLAPSE_EVENT, callback);
  return () => window.removeEventListener(COLLAPSE_EVENT, callback);
}

function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    () => localStorage.getItem(COLLAPSE_KEY) === '1',
    () => false,
  );
  const toggle = useCallback(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '0' : '1');
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }, [collapsed]);
  return [collapsed, toggle];
}

const BANNER_TONES = {
  info: { cls: 'border-accent/25 bg-accent/8', icon: IconInfo, iconCls: 'text-accent' },
  warn: { cls: 'border-warn/30 bg-warn/8', icon: IconAlert, iconCls: 'text-warn' },
  danger: { cls: 'border-neg/30 bg-neg/8', icon: IconXCircle, iconCls: 'text-neg' },
};

function Announcement() {
  const { announcement, trading } = useAppConfig();
  const items = [];
  if (!trading.enabled) {
    items.push({ tone: 'warn', message: 'New entries are paused by the administrator. You can still manage and close open positions.' });
  }
  if (announcement.enabled && announcement.message) {
    items.push({ tone: announcement.tone, message: announcement.message });
  }
  if (!items.length) return null;

  return items.map((item) => {
    const t = BANNER_TONES[item.tone] || BANNER_TONES.info;
    const Icon = t.icon;
    return (
      <div key={item.message} className={cn('flex items-center gap-2.5 border-b px-4 py-2 text-[13px] text-fg lg:px-6', t.cls)} role="status">
        <Icon size={15} className={cn('shrink-0', t.iconCls)} />
        <p className="min-w-0">{item.message}</p>
      </div>
    );
  });
}

function FeatureGate({ children }) {
  const pathname = usePathname();
  const { features } = useAppConfig();
  const item = navItemFor(pathname);

  if (item?.feature && features[item.feature] === false) {
    return (
      <EmptyState
        className="min-h-[60vh]"
        icon={IconLock}
        title={`${item.label} is turned off`}
        description="The administrator has disabled this page. Open positions are not affected."
        action={<ButtonLink href="/" variant="secondary" size="sm">Back to dashboard</ButtonLink>}
      />
    );
  }
  return children;
}

function Frame({ children }) {
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const config = useAppConfig();

  if (config.maintenance.enabled) {
    return <MaintenanceScreen brand={config.brand.name} message={config.maintenance.message} />;
  }

  return (
    <div className="min-h-dvh">
      <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      <MobileSidebar open={mobileOpen} onClose={closeMobile} />
      <div className={cn('flex min-h-dvh flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-[60px]' : 'lg:pl-[232px]')}>
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <Announcement />
        <main className="flex-1">
          <FeatureGate>{children}</FeatureGate>
        </main>
      </div>
    </div>
  );
}

export function DashboardShell({ initialConfig, initialSettings, children }) {
  return (
    <AppDataProvider initialConfig={initialConfig} initialSettings={initialSettings}>
      <NotificationProvider>
        <ConfirmProvider>
          <FuturesStreamProvider>
            <RiskAlerts />
            <Frame>{children}</Frame>
          </FuturesStreamProvider>
        </ConfirmProvider>
      </NotificationProvider>
    </AppDataProvider>
  );
}
