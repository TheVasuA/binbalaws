'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { signedUsd, usd, TONE_TEXT, toneOf } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import { Button, LiveDot, Menu, MenuItem, MenuLabel, MenuSeparator, Skeleton } from '@/components/ui';
import { IconMenu, IconMoon, IconPower, IconRefresh, IconSun, IconXCircle } from '@/components/ui/icons';
import { useFuturesStream } from '@/components/providers/futures-stream';
import { useCloseAll } from '@/components/trading/use-close-all';
import { navItemFor } from './nav';

function Figure({ label, value, tone = 'default', className }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[11px] leading-4 text-fg-subtle">{label}</p>
      <p className={cn('num truncate text-[13px] font-medium leading-5', TONE_TEXT[tone])}>{value}</p>
    </div>
  );
}

function AccountStrip() {
  const { account, loaded, dailyRisk, wsConnected, positions } = useFuturesStream();

  if (!loaded || !account) {
    return (
      <div className="hidden items-center gap-6 md:flex">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-5 xl:gap-7">
      <Figure label="Equity" value={usd(account.totalMarginBalance)} />
      <Figure label="Unrealized" value={signedUsd(account.totalUnrealizedProfit)} tone={toneOf(account.totalUnrealizedProfit)} />
      <Figure className="hidden sm:block" label="Today" value={signedUsd(dailyRisk.net)} tone={toneOf(dailyRisk.net)} />
      <Figure className="hidden xl:block" label="Wallet" value={usd(account.totalWalletBalance)} />
      <Figure className="hidden xl:block" label="Available" value={usd(account.availableBalance)} />
      <div
        className="hidden items-center gap-2 border-l border-line pl-5 text-xs text-fg-muted md:flex"
        title={wsConnected || positions.length === 0 ? 'Live price feed connected' : 'Price feed reconnecting'}
      >
        <LiveDot live={wsConnected || positions.length === 0} />
        {wsConnected || positions.length === 0 ? 'Live' : 'Reconnecting'}
      </div>
    </div>
  );
}

export function ThemeToggle() {
  const { resolved, setPreference } = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setPreference(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {resolved === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
    </Button>
  );
}

function RiskMenu() {
  const { refetch, positions } = useFuturesStream();
  const { closeAll, busy } = useCloseAll({ onDone: refetch });

  return (
    <Menu
      width="w-72"
      trigger={(props) => (
        <Button variant="danger-soft" size="sm" loading={!!busy} {...props}>
          {!busy && <IconPower size={14} />}
          <span className="hidden sm:inline">Close</span>
        </Button>
      )}
    >
      <MenuLabel>Emergency exits</MenuLabel>
      <MenuItem
        icon={IconXCircle}
        tone="danger"
        disabled={positions.length === 0}
        description="Market-close every position under 20x."
        onSelect={() => closeAll('standard')}
      >
        Close all
      </MenuItem>
      <MenuItem
        icon={IconPower}
        tone="danger"
        disabled={positions.length === 0}
        description="Market-close everything, including 20x and above."
        onSelect={() => closeAll('zero')}
      >
        Close everything
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={IconRefresh} onSelect={refetch}>
        Refresh positions
      </MenuItem>
    </Menu>
  );
}

export function Topbar({ onOpenMenu }) {
  const pathname = usePathname();
  const current = navItemFor(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70 lg:px-6">
      <Button variant="ghost" size="icon" className="-ml-1.5 lg:hidden" onClick={onOpenMenu} aria-label="Open menu">
        <IconMenu size={18} />
      </Button>
      {current && <h1 className="hidden shrink-0 text-sm font-semibold text-fg 2xl:block">{current.label}</h1>}
      <div className="min-w-0 flex-1 overflow-hidden 2xl:pl-6">
        <AccountStrip />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <ThemeToggle />
        <RiskMenu />
      </div>
    </header>
  );
}
