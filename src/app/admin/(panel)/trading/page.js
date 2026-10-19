'use client';

import { useState } from 'react';
import {
  Badge, Button, Callout, Card, CardBody, CardHeader, EmptyState, LeverageBadge, Page, PageHeader, SideBadge, Skeleton,
  Stat, StatGrid, Switch, Table, Td, Th, THead, Tr, useConfirm,
} from '@/components/ui';
import { IconActivity, IconOrder, IconPower, IconRefresh, IconX } from '@/components/ui/icons';
import { useApi } from '@/lib/use-api';
import { useNotify } from '@/lib/notify';
import { percent, price as fmtPrice, quantity as fmtQty, relativeTime, signedUsd, TONE_TEXT, toneOf, usd } from '@/lib/format';
import { cn } from '@/lib/cn';
import { adminPost, adminRequest } from '@/components/admin/admin-api';

const HUGE_LEVERAGE = 20;

function EntrySwitch({ config, onChanged }) {
  const confirm = useConfirm();
  const { notify } = useNotify();
  const [busy, setBusy] = useState(false);
  const enabled = config?.trading.enabled;

  const toggle = async (next) => {
    if (!next) {
      const ok = await confirm({
        tone: 'danger',
        title: 'Pause new entries?',
        description: 'The server rejects every new position until you turn this back on. Closing, stops and emergency exits keep working.',
        confirmLabel: 'Pause entries',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await adminRequest('/api/admin/config', { method: 'PUT', body: { trading: { enabled: next } } });
      await onChanged();
      notify({ level: next ? 'success' : 'warning', title: next ? 'New entries resumed' : 'New entries paused' });
    } catch (err) {
      notify({ level: 'danger', title: 'Could not update', message: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Switch
      label="Accept new entries"
      description={enabled ? 'Users can open positions within the configured limits.' : 'Paused. Only closing and risk edits are allowed.'}
      checked={!!enabled}
      disabled={!config || busy}
      onChange={toggle}
      tone="pos"
    />
  );
}

export default function AdminTradingPage() {
  const { data, error, loading, refetch } = useApi('/api/admin/trading', { refreshMs: 20_000 });
  const config = useApi('/api/admin/config');
  const confirm = useConfirm();
  const { notify } = useNotify();
  const [pending, setPending] = useState(null);

  const positions = data?.positions || [];
  const orders = data?.orders || [];
  const entryOrders = orders.filter((o) => !o.reduceOnly);
  const hugeCount = positions.filter((p) => p.leverage >= HUGE_LEVERAGE).length;
  const account = data?.account;
  const today = data?.dailyPnl?.realizedPnl;

  const run = async (key, { confirm: ask, body, success }) => {
    if (ask && !(await confirm({ tone: 'danger', ...ask }))) return;
    setPending(key);
    try {
      const result = await adminPost('/api/admin/trading', body);
      notify({ level: 'success', title: success(result) });
    } catch (err) {
      notify({ level: 'danger', title: 'Action failed', message: err.message });
    } finally {
      setPending(null);
      refetch();
    }
  };

  const closeAll = (includeHuge) =>
    run(includeHuge ? 'zero' : 'all', {
      confirm: includeHuge
        ? { title: 'Close every position?', description: `All ${positions.length} positions are closed at market, including ${hugeCount} at ${HUGE_LEVERAGE}x or higher.`, confirmLabel: 'Close everything' }
        : { title: `Close positions under ${HUGE_LEVERAGE}x?`, description: `${positions.length - hugeCount} positions are closed at market. ${hugeCount} at ${HUGE_LEVERAGE}x or higher are kept.`, confirmLabel: 'Close positions' },
      body: { action: includeHuge ? 'zeroClose' : 'closeAll' },
      success: (r) => `${r.closed} closed${r.skipped ? `, ${r.skipped} kept` : ''}${r.failed ? `, ${r.failed} failed` : ''}`,
    });

  const cancelEntries = () =>
    run('cancelEntries', {
      confirm: { title: 'Cancel resting entry orders?', description: `${entryOrders.length} entry orders are cancelled. Reduce-only exits (stops and targets) are left in place.`, confirmLabel: 'Cancel orders' },
      body: { action: 'cancelEntryOrders' },
      success: (r) => `${r.cancelled} cancelled${r.failed ? `, ${r.failed} failed` : ''}`,
    });

  const closeOne = (p) =>
    run(`pos:${p.symbol}:${p.side}`, {
      confirm: { title: `Close ${p.symbol} ${p.side.toLowerCase()}?`, description: `${fmtQty(p.positionAmt)} ${p.symbol.replace(/USDT$/, '')} at market. Unrealized PnL now ${signedUsd(p.unrealizedProfit)}.`, confirmLabel: 'Close position' },
      body: { action: 'closePosition', symbol: p.symbol, side: p.side, quantity: p.positionAmt },
      success: () => `${p.symbol} closed`,
    });

  const cancelOne = (o) =>
    run(`ord:${o.id}`, {
      body: { action: 'cancelOrder', symbol: o.symbol, orderId: o.id },
      success: () => `Order ${o.id} cancelled`,
    });

  return (
    <Page>
      <PageHeader
        title="Trading"
        description={data?.asOf ? `Live from Binance, updated ${relativeTime(data.asOf)}. Refreshes every 20 seconds.` : 'Live account state from Binance.'}
        actions={
          <Button variant="secondary" size="sm" onClick={refetch}>
            <IconRefresh size={14} />
            Refresh
          </Button>
        }
      />

      <div className="space-y-4">
        {error && <Callout tone="danger" title="Binance request failed">{error}</Callout>}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Entry switch" description="Server-enforced for every user and device." />
            <CardBody><EntrySwitch config={config.data} onChanged={config.refetch} /></CardBody>
          </Card>
          <Card className="border-neg/30">
            <CardHeader title="Emergency actions" description="Market orders. Every action is written to the audit log." />
            <CardBody className="flex flex-wrap gap-2">
              <Button variant="danger-soft" size="sm" onClick={() => closeAll(false)} loading={pending === 'all'} disabled={!!pending || positions.length === hugeCount}>
                <IconPower size={14} />
                Close under {HUGE_LEVERAGE}x
              </Button>
              <Button variant="danger" size="sm" onClick={() => closeAll(true)} loading={pending === 'zero'} disabled={!!pending || !positions.length}>
                Close everything
              </Button>
              <Button variant="secondary" size="sm" onClick={cancelEntries} loading={pending === 'cancelEntries'} disabled={!!pending || !entryOrders.length}>
                Cancel entry orders
                <span className="num text-fg-subtle">{entryOrders.length}</span>
              </Button>
            </CardBody>
          </Card>
        </div>

        {loading && !data ? (
          <Skeleton className="h-20" />
        ) : account ? (
          <StatGrid>
            <Stat label="Wallet" value={usd(account.totalWalletBalance)} />
            <Stat label="Margin balance" value={usd(account.totalMarginBalance)} />
            <Stat label="Unrealized" value={signedUsd(account.totalUnrealizedProfit)} tone={toneOf(account.totalUnrealizedProfit)} />
            <Stat label="Available" value={usd(account.availableBalance)} />
            <Stat label="Realized today" value={today === undefined || today === null ? '—' : signedUsd(today)} tone={toneOf(today)} sub="Net of fees and funding" />
            <Stat label="Margin in use" value={usd(account.totalPositionInitialMargin)} sub={`Maintenance ${usd(account.totalMaintMargin)}`} />
          </StatGrid>
        ) : null}

        <Card>
          <CardHeader title="Positions" actions={<span className="num text-xs text-fg-subtle">{positions.length}</span>} />
          {loading && !data ? (
            <div className="space-y-3 p-4"><Skeleton className="h-5" /><Skeleton className="h-5" /></div>
          ) : !positions.length ? (
            <EmptyState icon={IconActivity} title="No open positions" />
          ) : (
            <Table>
              <THead>
                <Th>Symbol</Th>
                <Th align="right">Size</Th>
                <Th align="right">Entry</Th>
                <Th align="right">Mark</Th>
                <Th align="right" className="hidden lg:table-cell">Liq.</Th>
                <Th align="right">PnL</Th>
                <Th align="right" className="hidden md:table-cell">Stop / Target</Th>
                <Th align="right"><span className="sr-only">Actions</span></Th>
              </THead>
              <tbody>
                {positions.map((p) => (
                  <Tr key={`${p.symbol}:${p.side}`}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-fg">{p.symbol.replace(/USDT$/, '')}</span>
                        <SideBadge side={p.side} />
                        <LeverageBadge leverage={p.leverage} />
                      </div>
                    </Td>
                    <Td align="right" className="text-fg">
                      {fmtQty(p.positionAmt)}
                      <div className="text-xs text-fg-subtle">{usd(p.notionalValue, 0)}</div>
                    </Td>
                    <Td align="right" className="text-fg-muted">{fmtPrice(p.entryPrice)}</Td>
                    <Td align="right" className="text-fg">{fmtPrice(p.markPrice)}</Td>
                    <Td align="right" className="hidden text-warn lg:table-cell">{p.liquidationPrice > 0 ? fmtPrice(p.liquidationPrice) : '—'}</Td>
                    <Td align="right" className={TONE_TEXT[toneOf(p.unrealizedProfit)]}>
                      {signedUsd(p.unrealizedProfit)}
                      <div className="text-xs opacity-80">{percent(p.roe, { signed: true })}</div>
                    </Td>
                    <Td align="right" className="hidden text-xs md:table-cell">
                      <div className={p.stopLossPrice ? 'text-neg' : 'text-fg-subtle'}>{p.stopLossPrice ? fmtPrice(p.stopLossPrice) : 'No stop'}</div>
                      <div className={p.takeProfitPrice ? 'text-pos' : 'text-fg-subtle'}>{p.takeProfitPrice ? fmtPrice(p.takeProfitPrice) : 'No target'}</div>
                    </Td>
                    <Td align="right" className="w-px">
                      <Button
                        variant="danger-soft"
                        size="xs"
                        onClick={() => closeOne(p)}
                        loading={pending === `pos:${p.symbol}:${p.side}`}
                        disabled={!!pending}
                      >
                        Close
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Open orders" actions={<span className="num text-xs text-fg-subtle">{orders.length}</span>} />
          {loading && !data ? (
            <div className="space-y-3 p-4"><Skeleton className="h-5" /></div>
          ) : !orders.length ? (
            <EmptyState icon={IconOrder} title="No open orders" description="Stops and targets placed as conditional orders are shown on each position." />
          ) : (
            <Table>
              <THead>
                <Th>Symbol</Th>
                <Th>Type</Th>
                <Th align="right">Price</Th>
                <Th align="right">Amount</Th>
                <Th className="hidden md:table-cell">Placed</Th>
                <Th align="right"><span className="sr-only">Actions</span></Th>
              </THead>
              <tbody>
                {orders.map((o) => (
                  <Tr key={o.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-fg">{o.symbol.replace(/USDT$/, '')}</span>
                        <Badge tone={o.side === 'buy' ? 'pos' : 'neg'}>{o.side === 'buy' ? 'Buy' : 'Sell'}</Badge>
                      </div>
                    </Td>
                    <Td className="text-fg-muted">
                      <span className="capitalize">{o.type.replace(/_/g, ' ')}</span>
                      {o.reduceOnly && <Badge tone="outline" className="ml-2">Reduce only</Badge>}
                    </Td>
                    <Td align="right" className="text-fg">{fmtPrice(o.price || o.stopPrice)}</Td>
                    <Td align="right" className="text-fg-muted">
                      {fmtQty(o.filled)} / {fmtQty(o.amount)}
                    </Td>
                    <Td className="num hidden text-fg-subtle md:table-cell">{relativeTime(o.timestamp)}</Td>
                    <Td align="right" className="w-px">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => cancelOne(o)}
                        loading={pending === `ord:${o.id}`}
                        disabled={!!pending}
                        aria-label={`Cancel order ${o.id}`}
                        className={cn(pending === `ord:${o.id}` && 'w-auto px-2')}
                      >
                        {pending !== `ord:${o.id}` && <IconX size={14} />}
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </Page>
  );
}
