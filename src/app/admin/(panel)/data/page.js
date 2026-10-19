'use client';

import { useState } from 'react';
import {
  Badge, Button, Callout, Card, CardBody, CardHeader, EmptyState, Field, Input, Page, PageHeader, SideBadge, Skeleton,
  Table, Td, Th, THead, Tr, useConfirm,
} from '@/components/ui';
import { IconDatabase, IconRefresh, IconTrash } from '@/components/ui/icons';
import { useApi } from '@/lib/use-api';
import { useNotify } from '@/lib/notify';
import { dateTime, price as fmtPrice, quantity as fmtQty } from '@/lib/format';
import { adminPost } from '@/components/admin/admin-api';

function GoalCard({ compound, onDone }) {
  const confirm = useConfirm();
  const { notify } = useNotify();
  const [start, setStart] = useState(null);
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(null);

  const savedStart = compound?.startingBalance ?? '';
  const savedCount = compound?.completedTrades?.length ?? 0;
  const startValue = start ?? String(savedStart);
  const countValue = count ?? String(savedCount);
  const dirty = start !== null || count !== null;
  const startInvalid = !(Number(startValue) > 0);
  const countInvalid = !Number.isInteger(Number(countValue)) || Number(countValue) < 0;

  const save = async () => {
    setBusy('save');
    try {
      await adminPost('/api/admin/data', { action: 'setCompound', startingBalance: Number(startValue), completedCount: Number(countValue) });
      setStart(null);
      setCount(null);
      notify({ level: 'success', title: 'Goal progress updated' });
      onDone();
    } catch (err) {
      notify({ level: 'danger', title: 'Not saved', message: err.message });
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    const ok = await confirm({
      tone: 'danger',
      title: 'Clear goal progress?',
      description: 'The starting balance and every completed step are deleted. The Goal page re-anchors to the wallet on next load.',
      confirmLabel: 'Clear progress',
    });
    if (!ok) return;
    setBusy('reset');
    try {
      await adminPost('/api/admin/data', { action: 'resetCompound' });
      setStart(null);
      setCount(null);
      notify({ level: 'success', title: 'Goal progress cleared' });
      onDone();
    } catch (err) {
      notify({ level: 'danger', title: 'Reset failed', message: err.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Goal progress"
        description={compound?.updatedAt ? `Last saved ${dateTime(compound.updatedAt)}` : 'Not saved yet'}
        actions={
          <Button variant="ghost" size="sm" onClick={reset} loading={busy === 'reset'} disabled={!!busy}>
            <IconTrash size={14} />
            Clear
          </Button>
        }
      />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starting balance" hint="The ladder is computed from this amount." error={dirty && startInvalid ? 'Must be above zero' : null}>
            {(id) => <Input id={id} type="number" min={0} step="0.01" prefix="$" className="num" value={startValue} onChange={(e) => setStart(e.target.value)} />}
          </Field>
          <Field label="Completed steps" hint="Trims or pads the completed list." error={dirty && countInvalid ? 'Whole number required' : null}>
            {(id) => <Input id={id} type="number" min={0} step={1} className="num" value={countValue} onChange={(e) => setCount(e.target.value)} />}
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          {dirty && <Button variant="ghost" size="sm" onClick={() => { setStart(null); setCount(null); }}>Discard</Button>}
          <Button variant="primary" size="sm" onClick={save} loading={busy === 'save'} disabled={!dirty || startInvalid || countInvalid || !!busy}>
            Save progress
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export default function AdminDataPage() {
  const { data, error, loading, refetch } = useApi('/api/admin/data');
  const confirm = useConfirm();
  const { notify } = useNotify();
  const [busy, setBusy] = useState(null);

  const runAction = async (action, ask, success) => {
    if (!(await confirm({ tone: 'danger', ...ask }))) return;
    setBusy(action);
    try {
      const result = await adminPost('/api/admin/data', { action });
      notify({ level: 'success', title: success(result) });
      refetch();
    } catch (err) {
      notify({ level: 'danger', title: 'Action failed', message: err.message });
    } finally {
      setBusy(null);
    }
  };

  const cacheKeys = data?.cacheKeys || [];

  return (
    <Page width="medium">
      <PageHeader
        title="Data"
        description="Stored application state in Redis. Exchange data on Binance is never modified from here."
        actions={
          <Button variant="secondary" size="sm" onClick={refetch}>
            <IconRefresh size={14} />
            Refresh
          </Button>
        }
      />

      {error && <Callout tone="danger" title="Could not load data" className="mb-4">{error}</Callout>}

      {loading && !data ? (
        <div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-64" /></div>
      ) : data ? (
        <div className="space-y-4">
          <GoalCard compound={data.compound} onDone={refetch} />

          <Card>
            <CardHeader
              title="Order log"
              description={`${data.orderCount} entries recorded by the order ticket. Showing the latest ${data.orders.length}.`}
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => runAction(
                    'clearOrderLog',
                    { title: 'Clear the order log?', description: `All ${data.orderCount} records are deleted, including stored stop and target prices used to restore risk levels. Binance orders are not affected.`, confirmLabel: 'Clear log' },
                    (r) => `${r.removed} records removed`,
                  )}
                  loading={busy === 'clearOrderLog'}
                  disabled={!data.orderCount || !!busy}
                >
                  <IconTrash size={14} />
                  Clear
                </Button>
              }
            />
            {!data.orders.length ? (
              <EmptyState icon={IconDatabase} title="No recorded orders" />
            ) : (
              <Table className="max-h-[420px] overflow-y-auto">
                <THead sticky>
                  <Th>Placed</Th>
                  <Th>Symbol</Th>
                  <Th align="right">Quantity</Th>
                  <Th align="right">Entry</Th>
                  <Th align="right" className="hidden sm:table-cell">Stop / Target</Th>
                </THead>
                <tbody>
                  {data.orders.map((o) => (
                    <Tr key={o.id}>
                      <Td className="num text-fg-muted">{dateTime(o.createdAt)}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-fg">{String(o.symbol || '').replace(/USDT$/, '')}</span>
                          {o.side && <SideBadge side={o.side} />}
                          {o.leverage ? <Badge className="num">{o.leverage}x</Badge> : null}
                        </div>
                      </Td>
                      <Td align="right" className="text-fg">{o.quantity !== null ? fmtQty(o.quantity) : '—'}</Td>
                      <Td align="right" className="text-fg-muted">{o.entryPrice ? fmtPrice(o.entryPrice) : '—'}</Td>
                      <Td align="right" className="hidden text-xs sm:table-cell">
                        <span className="text-neg">{o.requestedRisk?.stopLossPrice ? fmtPrice(o.requestedRisk.stopLossPrice) : '—'}</span>
                        <span className="px-1 text-fg-subtle">/</span>
                        <span className="text-pos">{o.requestedRisk?.takeProfitPrice ? fmtPrice(o.requestedRisk.takeProfitPrice) : '—'}</span>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Response cache"
              description="Short-lived copies of Binance responses shared by every visitor. Flushing forces fresh requests."
              actions={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => runAction(
                    'flushCache',
                    { title: 'Flush the response cache?', description: `${cacheKeys.length} cached responses are deleted. The next requests go straight to Binance and count against the API weight limit.`, confirmLabel: 'Flush cache' },
                    (r) => `${r.removed} keys removed`,
                  )}
                  loading={busy === 'flushCache'}
                  disabled={!cacheKeys.length || !!busy}
                >
                  <IconTrash size={14} />
                  Flush
                </Button>
              }
            />
            <CardBody>
              {cacheKeys.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {cacheKeys.map((k) => <Badge key={k} tone="outline" className="font-mono">{k.replace(/^cache:/, '')}</Badge>)}
                </div>
              ) : (
                <p className="text-[13px] text-fg-muted">The cache is empty.</p>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}
    </Page>
  );
}
