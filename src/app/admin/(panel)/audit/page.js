'use client';

import { useMemo, useState } from 'react';
import {
  Badge, Button, Callout, Card, EmptyState, Input, Page, PageHeader, Segmented, Skeleton, Table, Td, Th, THead, Tr,
} from '@/components/ui';
import { IconRefresh, IconScroll, IconSearch } from '@/components/ui/icons';
import { useApi } from '@/lib/use-api';
import { dateTime, relativeTime } from '@/lib/format';
import { auditTone } from '@/components/admin/audit-list';

const AREAS = [
  { value: 'all', label: 'All' },
  { value: 'trading', label: 'Trading', match: (a) => a.startsWith('trading') || a.startsWith('basket') },
  { value: 'config', label: 'Config', match: (a) => a.startsWith('config') || a.startsWith('settings') },
  { value: 'data', label: 'Data', match: (a) => /^(goal|orders|cache)\./.test(a) },
  { value: 'access', label: 'Access', match: (a) => a.startsWith('login') || a === 'logout' },
];

export default function AdminAuditPage() {
  const { data, error, loading, refetch } = useApi('/api/admin/audit?limit=500', { refreshMs: 30_000 });
  const [area, setArea] = useState('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const match = AREAS.find((a) => a.value === area)?.match;
    const q = query.trim().toLowerCase();
    return (data || []).filter((e) => {
      const action = e.action || '';
      if (match && !match(action)) return false;
      if (!q) return true;
      return `${action} ${e.detail || ''} ${e.ip || ''}`.toLowerCase().includes(q);
    });
  }, [data, area, query]);

  const [dayAgo] = useState(() => Date.now() - 86_400_000);
  const failedLogins = useMemo(
    () => (data || []).filter((e) => e.action === 'login.failed' && Date.parse(e.at) > dayAgo).length,
    [data, dayAgo],
  );

  return (
    <Page>
      <PageHeader
        title="Audit log"
        description="The last 500 admin actions, newest first. Entries cannot be edited or removed from here."
        actions={
          <Button variant="secondary" size="sm" onClick={refetch}>
            <IconRefresh size={14} />
            Refresh
          </Button>
        }
      />

      {failedLogins >= 3 && (
        <Callout tone="warn" title={`${failedLogins} failed sign-in attempts in the last day`} className="mb-4">
          Check the IP addresses below. Rotate <code className="rounded bg-surface-3 px-1 text-xs">ADMIN_PASSWORD</code> if they are not yours.
        </Callout>
      )}
      {error && <Callout tone="danger" title="Could not load the audit log" className="mb-4">{error}</Callout>}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Segmented ariaLabel="Area" options={AREAS} value={area} onChange={setArea} />
        <Input
          size="sm"
          prefix={<IconSearch size={14} />}
          placeholder="Search action, detail or IP"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:w-72"
          aria-label="Search audit log"
        />
      </div>

      <Card>
        {loading && !data ? (
          <div className="space-y-3 p-4">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-4" />)}</div>
        ) : !rows.length ? (
          <EmptyState icon={IconScroll} title="No entries" description={query || area !== 'all' ? 'Nothing matches the current filter.' : 'Admin actions will appear here.'} />
        ) : (
          <Table>
            <THead>
              <Th>When</Th>
              <Th>Action</Th>
              <Th>Detail</Th>
              <Th className="hidden md:table-cell">IP</Th>
            </THead>
            <tbody>
              {rows.map((e, i) => (
                <Tr key={`${e.at}-${i}`}>
                  <Td className="num text-fg-muted" title={relativeTime(e.at)}>{dateTime(e.at)}</Td>
                  <Td><Badge tone={auditTone(e.action)} className="font-mono">{e.action}</Badge></Td>
                  <Td className="max-w-[560px] whitespace-normal break-words text-fg-muted">{e.detail || <span className="text-fg-subtle">—</span>}</Td>
                  <Td className="num hidden text-fg-subtle md:table-cell">{e.ip || '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </Page>
  );
}
