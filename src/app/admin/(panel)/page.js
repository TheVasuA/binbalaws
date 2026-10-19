'use client';

import Link from 'next/link';
import {
  Badge, Button, Callout, Card, CardBody, CardHeader, Page, PageHeader, Progress, Skeleton, Stat, StatGrid,
} from '@/components/ui';
import { IconChevronRight, IconDatabase, IconLayers, IconRefresh, IconServer, IconZap } from '@/components/ui/icons';
import { useApi } from '@/lib/use-api';
import { duration, relativeTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { ADMIN_NAV } from '@/components/admin/admin-nav';
import { AuditList } from '@/components/admin/audit-list';

function StatusDot({ ok, warn }) {
  return <span className={cn('h-2 w-2 shrink-0 rounded-full', ok ? (warn ? 'bg-warn' : 'bg-pos') : 'bg-neg')} aria-hidden="true" />;
}

function ServiceCard({ icon: Icon, name, ok, warn, status, rows }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
            <Icon size={15} className="text-fg-subtle" />
            {name}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-fg-muted">
            <StatusDot ok={ok} warn={warn} />
            {status}
          </span>
        </div>
        <dl className="space-y-1.5 text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3">
              <dt className="text-fg-muted">{label}</dt>
              <dd className="num truncate text-fg">{value}</dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}

export default function AdminOverviewPage() {
  const system = useApi('/api/admin/system', { refreshMs: 15_000 });
  const config = useApi('/api/admin/config', { refreshMs: 30_000 });
  const audit = useApi('/api/admin/audit?limit=8', { refreshMs: 30_000 });
  const s = system.data;
  const c = config.data;

  const weightPct = s ? (s.apiWeight.used / s.apiWeight.limit) * 100 : 0;
  const drift = s?.services.binance.clockDriftMs;

  return (
    <Page>
      <PageHeader
        title="Overview"
        description="Service health, configuration status and recent admin activity."
        actions={
          <Button variant="secondary" size="sm" onClick={() => { system.refetch(); config.refetch(); audit.refetch(); }}>
            <IconRefresh size={14} />
            Refresh
          </Button>
        }
      />

      <div className="space-y-4">
        {system.error && <Callout tone="danger" title="Health check failed">{system.error}</Callout>}

        {c && (c.maintenance.enabled || !c.trading.enabled) && (
          <Callout
            tone="warn"
            title={c.maintenance.enabled ? 'Maintenance mode is on' : 'New entries are paused'}
            action={<Link href="/admin/features" className="text-[13px] font-medium text-accent hover:underline">Manage</Link>}
          >
            {c.maintenance.enabled ? 'The dashboard shows the maintenance screen to every visitor.' : 'Users can still manage and close open positions.'}
          </Callout>
        )}

        {s && !s.security.sessionSecretSet && (
          <Callout tone="info" title="Session secret not set">
            Sessions are signed with a key derived from the admin password. For a stronger key, set <code className="rounded bg-surface-3 px-1 text-xs">ADMIN_SESSION_SECRET</code> to a long random value.
          </Callout>
        )}

        {!s ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <ServiceCard
              icon={IconZap}
              name="Binance futures"
              ok={s.services.binance.ok && s.services.binance.credentials}
              warn={Math.abs(drift || 0) > 1000}
              status={!s.services.binance.ok ? 'Unreachable' : !s.services.binance.credentials ? 'No API keys' : 'Connected'}
              rows={[
                ['Network', s.services.binance.testnet ? 'Testnet' : 'Mainnet'],
                ['Latency', `${s.services.binance.latencyMs} ms`],
                ['Clock drift', drift === null ? '—' : `${drift > 0 ? '+' : ''}${drift} ms`],
              ]}
            />
            <ServiceCard
              icon={IconDatabase}
              name="Redis"
              ok={s.services.redis.ok}
              warn={s.services.redis.latencyMs > 250}
              status={s.services.redis.ok ? 'Connected' : 'Unreachable'}
              rows={[
                ['Latency', `${s.services.redis.latencyMs} ms`],
                ['Stored orders', s.storedOrders ?? '—'],
                ['Error', s.services.redis.error || 'None'],
              ]}
            />
            <ServiceCard
              icon={IconLayers}
              name="Bulk watcher"
              ok={s.services.watcher.ok || s.baskets.armed === 0}
              warn={!s.services.watcher.ok}
              status={s.services.watcher.ok ? 'Running' : 'Not running'}
              rows={[
                ['Last seen', s.services.watcher.lastSeen ? relativeTime(s.services.watcher.lastSeen) : 'Never'],
                ['Poll interval', s.services.watcher.pollMs ? `${s.services.watcher.pollMs} ms` : '—'],
                ['Baskets', `${s.baskets.active} active, ${s.baskets.armed} armed`],
              ]}
            />
          </div>
        )}

        {s && !s.services.watcher.ok && s.baskets.armed > 0 && (
          <Callout tone="danger" title="Armed baskets without a watcher">
            {s.baskets.armed} basket{s.baskets.armed === 1 ? ' is' : 's are'} armed but the watcher process is not running, so auto-exit only works while a browser tab is open.
          </Callout>
        )}

        {s && (
          <StatGrid className="lg:grid-cols-4">
            <div>
              <Stat label="API weight (1 min)" value={`${s.apiWeight.used} / ${s.apiWeight.limit}`} tone={weightPct > 80 ? 'neg' : weightPct > 50 ? 'warn' : 'default'} />
              <Progress value={weightPct} tone={weightPct > 80 ? 'neg' : weightPct > 50 ? 'warn' : 'accent'} className="mt-2" />
            </div>
            <Stat label="Uptime" value={duration(s.process.uptimeSec)} sub={`Node ${s.process.node}, ${s.process.env}`} />
            <Stat label="Memory" value={`${s.process.rssMb} MB`} sub={`Heap ${s.process.heapMb} MB`} />
            <Stat label="Last check" value={new Date(s.now).toLocaleTimeString('en-GB')} sub="Refreshes every 15s" />
          </StatGrid>
        )}

        <div className="grid gap-4 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader
              title="Recent activity"
              actions={<Link href="/admin/audit" className="text-xs font-medium text-accent hover:underline">View all</Link>}
            />
            <AuditList entries={audit.data} loading={audit.loading && !audit.data} compact />
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Configuration" />
            <div className="divide-y divide-line">
              {!c ? (
                <div className="space-y-2 p-4"><Skeleton className="h-4" /><Skeleton className="h-4" /><Skeleton className="h-4" /></div>
              ) : (
                <>
                  <ConfigRow label="New entries" on={c.trading.enabled} />
                  <ConfigRow label="Limit orders" on={c.trading.limitOrdersEnabled} />
                  <ConfigRow label="Bulk scalp" on={c.trading.bulk.enabled} />
                  <ConfigRow label="Maintenance" on={c.maintenance.enabled} invert />
                  <ConfigRow label="Announcement" on={c.announcement.enabled} neutral />
                  <div className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                    <span className="text-fg-muted">Leverage cap</span>
                    <span className="num font-medium text-fg">{c.trading.maxLeverage}x</span>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>

        <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_NAV.slice(1).map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="group flex items-center gap-3 bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2">
                <Icon size={16} className="shrink-0 text-fg-subtle" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-fg">{item.label}</span>
                  <span className="block truncate text-xs text-fg-muted">{item.description}</span>
                </span>
                <IconChevronRight size={14} className="text-fg-subtle transition-transform group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>

        {s && (
          <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <IconServer size={12} />
            Health data reflects this server process only.
          </p>
        )}
      </div>
    </Page>
  );
}

function ConfigRow({ label, on, invert = false, neutral = false }) {
  const good = invert ? !on : on;
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-[13px]">
      <span className="text-fg-muted">{label}</span>
      <Badge tone={neutral ? (on ? 'accent' : 'neutral') : good ? 'pos' : 'warn'} dot>{on ? 'On' : 'Off'}</Badge>
    </div>
  );
}
