'use client';

import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, LiveDot, Page, PageHeader, Stat, StatGrid } from '@/components/ui';
import { IconMonitor, IconMoon, IconPower, IconShield, IconSun } from '@/components/ui/icons';
import { usePortfolioSettings } from '@/components/providers/app-data';
import { useFuturesStream } from '@/components/providers/futures-stream';
import { useCloseAll } from '@/components/trading/use-close-all';
import { SETTINGS_FIELDS, SETTINGS_GROUPS } from '@/lib/settings-schema';
import { THEME_PREFERENCES, useTheme } from '@/lib/theme';
import { usd } from '@/lib/format';
import { cn } from '@/lib/cn';

const THEME_ICONS = { dark: IconMoon, light: IconSun, system: IconMonitor };
const IS_TESTNET = process.env.NEXT_PUBLIC_BINANCE_TESTNET === 'true';

/** Miniature of the app painted with a given palette. */
function ThemePreview({ theme }) {
  const half = (palette) => (
    <div data-theme={palette} className="flex h-full flex-1 gap-1.5 bg-bg p-2">
      <div className="w-1/4 space-y-1 rounded-sm bg-surface p-1">
        <div className="h-1 rounded-full bg-accent" />
        <div className="h-1 rounded-full bg-line-strong" />
        <div className="h-1 rounded-full bg-line-strong" />
      </div>
      <div className="flex-1 space-y-1.5 rounded-sm border border-line bg-surface p-1.5">
        <div className="h-1.5 w-1/2 rounded-full bg-fg-muted" />
        <div className="flex gap-1">
          <div className="h-3 flex-1 rounded-sm bg-pos/70" />
          <div className="h-3 flex-1 rounded-sm bg-neg/70" />
        </div>
        <div className="h-1 rounded-full bg-line-strong" />
      </div>
    </div>
  );
  return (
    <div className="flex h-20 overflow-hidden rounded-md border border-line">
      {theme === 'system' ? (
        <>
          {half('light')}
          {half('dark')}
        </>
      ) : (
        half(theme)
      )}
    </div>
  );
}

function formatSetting(field, value) {
  if (field.type === 'boolean') {
    return Number(value) === 1 ? <Badge tone="accent">On</Badge> : <Badge>Off</Badge>;
  }
  const n = Number(value);
  if (field.unit === 'USD') return usd(n, 0);
  if (field.unit === 'x') return `${n}x`;
  if (field.unit === '₹ per $') return `₹${n} per $`;
  if (field.unit?.startsWith('%')) return `${n}%${field.unit.length > 1 ? ` ${field.unit.slice(2)}` : ''}`;
  return `${n} ${field.unit || ''}`.trim();
}

export default function SettingsPage() {
  const { preference, setPreference } = useTheme();
  const settings = usePortfolioSettings();
  const { account, positions, wsConnected, loaded } = useFuturesStream();
  const { closeAll, busy } = useCloseAll();

  const wallet = Number(account?.totalWalletBalance) || 0;
  const highLev = positions.filter((p) => Number(p.leverage) >= Number(settings.maxLeverageWarn)).length;

  return (
    <Page width="narrow">
      <PageHeader title="Settings" description="Appearance and account status for this device. Trading limits are managed in the admin panel." />

      <div className="space-y-4">
        <Card>
          <CardHeader title="Appearance" description="Stored in this browser only." />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
              {THEME_PREFERENCES.map((t) => {
                const Icon = THEME_ICONS[t.id];
                const active = preference === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPreference(t.id)}
                    className={cn(
                      'rounded-lg border p-2 text-left transition-colors',
                      active ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-line-strong',
                    )}
                  >
                    <ThemePreview theme={t.id} />
                    <span className="mt-2 flex items-center gap-2 px-0.5 text-[13px] font-medium text-fg">
                      <Icon size={14} className={active ? 'text-accent' : 'text-fg-muted'} />
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Account"
            actions={
              <span className="inline-flex items-center gap-2 text-xs text-fg-muted">
                <LiveDot live={wsConnected} />
                {wsConnected ? 'Live' : loaded ? 'Polling' : 'Connecting'}
              </span>
            }
          />
          <StatGrid className="rounded-none border-0 border-b lg:grid-cols-4">
            <Stat label="Environment" value={IS_TESTNET ? 'Testnet' : 'Mainnet'} tone={IS_TESTNET ? 'warn' : 'default'} size="sm" />
            <Stat label="Wallet" value={loaded ? usd(wallet) : '—'} size="sm" />
            <Stat label="Open positions" value={positions.length} size="sm" tone={positions.length > Number(settings.maxOpenPositions) ? 'warn' : 'default'} />
            <Stat label="High leverage" value={highLev} size="sm" tone={highLev ? 'neg' : 'default'} sub={`At ${settings.maxLeverageWarn}x or more`} />
          </StatGrid>
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-fg-muted">
              Emergency exits. Close all keeps positions at 20x or higher; close everything does not.
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="danger-soft" size="sm" onClick={() => closeAll('standard')} loading={busy === 'standard'} disabled={!positions.length || !!busy}>
                <IconPower size={14} />
                Close all
              </Button>
              <Button variant="danger" size="sm" onClick={() => closeAll('zero')} loading={busy === 'zero'} disabled={!positions.length || !!busy}>
                Close everything
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Trading limits"
            description="Read only. Changes are audited and apply to every device."
            actions={
              <ButtonLink href="/admin/risk" size="sm" variant="secondary">
                <IconShield size={14} />
                Edit in admin
              </ButtonLink>
            }
          />
          <div className="divide-y divide-line">
            {SETTINGS_GROUPS.map((group) => (
              <section key={group.id} className="px-4 py-3">
                <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">{group.label}</h3>
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {SETTINGS_FIELDS.filter((f) => f.group === group.id).map((f) => (
                    <div key={f.key} className="flex items-center justify-between gap-3 text-[13px]">
                      <dt className="truncate text-fg-muted" title={f.help}>{f.label}</dt>
                      <dd className="num shrink-0 font-medium text-fg">{formatSetting(f, settings[f.key])}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </Card>
      </div>
    </Page>
  );
}
