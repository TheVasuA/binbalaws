'use client';

import { useState } from 'react';
import {
  Badge, Button, Callout, Card, CardBody, CardHeader, Dialog, EmptyState, Field, Input, Page, PageHeader, SideBadge,
  Skeleton, Switch, useConfirm,
} from '@/components/ui';
import { IconLayers, IconRefresh, IconTrash } from '@/components/ui/icons';
import { useApi } from '@/lib/use-api';
import { useNotify } from '@/lib/notify';
import { dateTime, relativeTime, usd } from '@/lib/format';
import { adminRequest } from '@/components/admin/admin-api';

function ThresholdDialog({ basket, onClose, onSaved }) {
  const { notify } = useNotify();
  const [target, setTarget] = useState(basket.targetUsdt ?? '');
  const [stop, setStop] = useState(basket.stopUsdt ?? '');
  const [busy, setBusy] = useState(false);

  const parse = (v) => (String(v).trim() === '' ? null : Number(v));
  const targetVal = parse(target);
  const stopVal = parse(stop);
  const invalid = (targetVal !== null && !(targetVal > 0)) || (stopVal !== null && !(stopVal > 0));

  const save = async () => {
    setBusy(true);
    try {
      await adminRequest('/api/admin/baskets', { method: 'PATCH', body: { id: basket.id, targetUsdt: targetVal, stopUsdt: stopVal } });
      notify({ level: 'success', title: 'Thresholds updated' });
      onSaved();
      onClose();
    } catch (err) {
      notify({ level: 'danger', title: 'Not saved', message: err.message });
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Exit thresholds"
      description={`Basket ${basket.id.slice(0, 8)}: ${basket.symbols.length} coins, ${basket.side.toLowerCase()}. Leave a field empty to remove that exit.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={invalid}>Save</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Take profit" hint="Combined PnL in USDT" error={targetVal !== null && !(targetVal > 0) ? 'Must be above zero' : null}>
          {(id) => <Input id={id} type="number" min={0} step="0.5" prefix="$" className="num" value={target} onChange={(e) => setTarget(e.target.value)} data-autofocus />}
        </Field>
        <Field label="Stop loss" hint="Combined loss in USDT" error={stopVal !== null && !(stopVal > 0) ? 'Must be above zero' : null}>
          {(id) => <Input id={id} type="number" min={0} step="0.5" prefix="$" className="num" value={stop} onChange={(e) => setStop(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}

export default function AdminBasketsPage() {
  const { data, error, loading, refetch } = useApi('/api/admin/baskets', { refreshMs: 10_000 });
  const confirm = useConfirm();
  const { notify } = useNotify();
  const [editing, setEditing] = useState(null);
  const [pending, setPending] = useState(null);

  const baskets = [...(data?.baskets || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const heartbeat = data?.heartbeat;

  const setArmed = async (b, armed) => {
    setPending(b.id);
    try {
      await adminRequest('/api/admin/baskets', { method: 'PATCH', body: { id: b.id, armed } });
      await refetch();
    } catch (err) {
      notify({ level: 'danger', title: 'Could not update', message: err.message });
    } finally {
      setPending(null);
    }
  };

  const remove = async (b) => {
    const ok = await confirm({
      tone: 'danger',
      title: 'Stop tracking this basket?',
      description: 'The basket record is removed so nothing auto-exits it. Its positions stay open on Binance; close them from Trading if needed.',
      confirmLabel: 'Remove basket',
    });
    if (!ok) return;
    setPending(b.id);
    try {
      await adminRequest(`/api/admin/baskets?id=${encodeURIComponent(b.id)}`, { method: 'DELETE' });
      await refetch();
      notify({ level: 'success', title: 'Basket removed' });
    } catch (err) {
      notify({ level: 'danger', title: 'Could not remove', message: err.message });
    } finally {
      setPending(null);
    }
  };

  return (
    <Page width="medium">
      <PageHeader
        title="Bulk baskets"
        description="Baskets registered by the Bulk scalp page. The watcher closes armed baskets when combined PnL reaches a threshold."
        actions={
          <Button variant="secondary" size="sm" onClick={refetch}>
            <IconRefresh size={14} />
            Refresh
          </Button>
        }
      />

      <div className="space-y-4">
        {error && <Callout tone="danger" title="Could not load baskets">{error}</Callout>}

        {data && (
          heartbeat ? (
            <Callout tone="success" title="Watcher running">
              Last tick {relativeTime(heartbeat.at)}, polling every {heartbeat.pollMs} ms (pid {heartbeat.pid}).
            </Callout>
          ) : (
            <Callout tone={baskets.some((b) => b.armed) ? 'danger' : 'warn'} title="Watcher not running">
              Armed baskets only auto-exit while a browser tab has the Bulk scalp page open. Start it with <code className="rounded bg-surface-3 px-1 text-xs">npm run watcher</code>.
            </Callout>
          )
        )}

        {loading && !data ? (
          <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
        ) : !baskets.length ? (
          <Card><EmptyState icon={IconLayers} title="No active baskets" description="Baskets appear here after they are opened from Bulk scalp." /></Card>
        ) : (
          baskets.map((b) => (
            <Card key={b.id}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="num font-mono text-xs text-fg-muted">{b.id.slice(0, 8)}</span>
                    <SideBadge side={b.side} />
                    {b.status !== 'active' && <Badge tone="warn">{b.status}</Badge>}
                  </span>
                }
                description={`Opened ${dateTime(b.createdAt)}${b.updatedAt && b.updatedAt !== b.createdAt ? `, updated ${relativeTime(b.updatedAt)}` : ''}`}
                actions={
                  <Button variant="ghost" size="icon-sm" onClick={() => remove(b)} disabled={pending === b.id} aria-label="Remove basket">
                    <IconTrash size={14} />
                  </Button>
                }
              />
              <CardBody className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {b.symbols.map((s) => <Badge key={s} tone="outline">{s.replace(/USDT$/, '')}</Badge>)}
                </div>
                <div className="flex flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex gap-8 text-[13px]">
                    <div>
                      <p className="text-xs text-fg-muted">Take profit</p>
                      <p className="num font-medium text-pos">{b.targetUsdt ? `+${usd(b.targetUsdt)}` : <span className="text-fg-subtle">None</span>}</p>
                    </div>
                    <div>
                      <p className="text-xs text-fg-muted">Stop loss</p>
                      <p className="num font-medium text-neg">{b.stopUsdt ? `−${usd(b.stopUsdt)}` : <span className="text-fg-subtle">None</span>}</p>
                    </div>
                    <Button variant="secondary" size="xs" onClick={() => setEditing(b)} className="self-end">Edit</Button>
                  </div>
                  <div className="sm:w-56">
                    <Switch
                      label="Armed"
                      description={b.armed ? 'Auto-exit active' : 'Thresholds ignored'}
                      checked={!!b.armed}
                      disabled={pending === b.id}
                      onChange={(v) => setArmed(b, v)}
                    />
                  </div>
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>

      {editing && <ThresholdDialog key={editing.id} basket={editing} onClose={() => setEditing(null)} onSaved={refetch} />}
    </Page>
  );
}
