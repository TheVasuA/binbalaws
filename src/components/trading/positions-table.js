'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  LeverageBadge,
  Menu,
  MenuItem,
  SideBadge,
  Table,
  Td,
  Th,
  THead,
  Tr,
  useConfirm,
} from '@/components/ui';
import { IconLayers, IconMore, IconTarget, IconX, IconXCircle } from '@/components/ui/icons';
import { usePortfolioSettings } from '@/components/providers/app-data';
import { futuresAction, positionMetrics } from '@/lib/futures-client';
import { compactUsd, inr, percent, price, quantity, signedUsd, TONE_TEXT, toneOf, usd } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useNotify } from '@/lib/notify';
import { PositionDialog } from './position-dialogs';

const base = (symbol) => symbol.replace(/USDT$/, '');

function ExitCell({ value, triggerPrice, kind }) {
  if (!triggerPrice) return <span className="text-fg-subtle">—</span>;
  const v = Number(value) || 0;
  // A stop in profit (trailed past entry) reads as positive.
  const tone = kind === 'tp' ? 'pos' : v >= 0 ? 'pos' : 'neg';
  return (
    <div className="leading-tight">
      <div className={cn('font-medium', TONE_TEXT[tone])}>{signedUsd(v, 0)}</div>
      <div className="text-xs text-fg-subtle">{price(triggerPrice)}</div>
    </div>
  );
}

function usePositionActions(onRefresh) {
  const confirm = useConfirm();
  const { notify } = useNotify();
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(null);

  const closeNow = async (position) => {
    const ok = await confirm({
      title: `Close ${position.symbol}?`,
      description: `The full ${position.side.toLowerCase()} position (${quantity(position.positionAmt)}) is closed at market.`,
      confirmLabel: 'Close at market',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(position.symbol);
    try {
      await futuresAction('closePosition', {
        symbol: position.symbol,
        side: position.side,
        quantity: Math.abs(Number(position.positionAmt)),
      });
      notify({ level: 'success', title: 'Position closed', message: position.symbol });
      onRefresh?.();
    } catch (err) {
      notify({ level: 'danger', title: `Could not close ${position.symbol}`, message: err.message });
    } finally {
      setBusy(null);
    }
  };

  return { dialog, setDialog, busy, closeNow };
}

function RowActions({ position, busy, onClose, onPartial, onRisk }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button size="xs" variant="secondary" onClick={onRisk} title="Edit target and stop">
        TP/SL
      </Button>
      <Menu
        width="w-48"
        trigger={(props) => (
          <Button size="icon-sm" variant="ghost" aria-label={`More actions for ${position.symbol}`} {...props}>
            <IconMore size={15} />
          </Button>
        )}
      >
        <MenuItem icon={IconLayers} onSelect={onPartial}>Partial or limit close</MenuItem>
        <MenuItem icon={IconTarget} onSelect={onRisk}>Edit target and stop</MenuItem>
      </Menu>
      <Button
        size="icon-sm"
        variant="danger-soft"
        loading={busy}
        onClick={onClose}
        aria-label={`Close ${position.symbol} at market`}
        title="Close at market"
      >
        {!busy && <IconX size={14} />}
      </Button>
    </div>
  );
}

export function PositionsTable({ positions, onRefresh }) {
  const settings = usePortfolioSettings();
  const { dialog, setDialog, busy, closeNow } = usePositionActions(onRefresh);
  const dangerAt = Number(settings.maxLeverageWarn) || 20;
  const rate = Number(settings.inrRate) || 0;

  const rows = useMemo(
    () =>
      [...(positions || [])]
        .map((p) => ({ position: p, m: positionMetrics(p) }))
        .sort((a, b) => b.m.notional - a.m.notional),
    [positions],
  );

  if (!rows.length) {
    return <EmptyState icon={IconLayers} title="No open positions" description="Positions you open will show here with live PnL." />;
  }

  return (
    <>
      {/* Desktop */}
      <Table className="hidden md:block">
        <THead>
          <Th>Symbol</Th>
          <Th align="right">Size</Th>
          <Th align="right">Entry</Th>
          <Th align="right">Mark</Th>
          <Th align="right">Liq.</Th>
          <Th align="right">PnL</Th>
          <Th align="right">Target</Th>
          <Th align="right">Stop</Th>
          <Th align="right"><span className="sr-only">Actions</span></Th>
        </THead>
        <tbody>
          {rows.map(({ position: p, m }) => (
            <Tr key={`${p.symbol}-${p.side}`}>
              <Td>
                <div className="flex items-center gap-2">
                  <span className={cn('h-6 w-0.5 rounded-full', p.side === 'LONG' ? 'bg-pos' : 'bg-neg')} aria-hidden="true" />
                  <div>
                    <div className="font-semibold text-fg">{base(p.symbol)}</div>
                    <div className="mt-0.5 flex items-center gap-1">
                      <SideBadge side={p.side} />
                      <LeverageBadge leverage={m.leverage} dangerAt={dangerAt} />
                    </div>
                  </div>
                </div>
              </Td>
              <Td align="right">
                <div className="font-medium text-fg">{compactUsd(m.notional)}</div>
                <div className="text-xs text-fg-subtle">{quantity(m.qty)}</div>
              </Td>
              <Td align="right" className="text-fg-muted">{price(m.entry)}</Td>
              <Td align="right" className="text-fg">{price(m.mark)}</Td>
              <Td align="right" className="text-warn">{p.liquidationPrice > 0 ? price(p.liquidationPrice) : '—'}</Td>
              <Td align="right">
                <div className={cn('font-semibold', TONE_TEXT[toneOf(m.pnl)])}>{signedUsd(m.pnl)}</div>
                <div className="text-xs text-fg-subtle">
                  {percent(m.roe, { signed: true })}
                  {rate > 0 && <span className="ml-1.5">{inr(m.pnl, rate)}</span>}
                </div>
              </Td>
              <Td align="right"><ExitCell kind="tp" value={p.takeProfitValue} triggerPrice={p.takeProfitPrice} /></Td>
              <Td align="right"><ExitCell kind="sl" value={p.stopLossValue} triggerPrice={p.stopLossPrice} /></Td>
              <Td align="right">
                <RowActions
                  position={p}
                  busy={busy === p.symbol}
                  onClose={() => closeNow(p)}
                  onPartial={() => setDialog({ kind: 'close', position: p })}
                  onRisk={() => setDialog({ kind: 'risk', position: p })}
                />
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      {/* Mobile */}
      <ul className="divide-y divide-line md:hidden">
        {rows.map(({ position: p, m }) => (
          <li key={`${p.symbol}-${p.side}`} className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-fg">{base(p.symbol)}</span>
                  <SideBadge side={p.side} />
                  <LeverageBadge leverage={m.leverage} dangerAt={dangerAt} />
                </div>
                <p className="num mt-1 text-xs text-fg-subtle">
                  {compactUsd(m.notional)} · entry {price(m.entry)} · mark {price(m.mark)}
                </p>
              </div>
              <div className="text-right">
                <div className={cn('num font-semibold', TONE_TEXT[toneOf(m.pnl)])}>{signedUsd(m.pnl)}</div>
                <div className="num text-xs text-fg-subtle">{percent(m.roe, { signed: true })}</div>
              </div>
            </div>
            <dl className="num mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-fg-subtle">Target</dt>
                <dd className={p.takeProfitPrice ? 'text-pos' : 'text-fg-subtle'}>{p.takeProfitPrice ? price(p.takeProfitPrice) : '—'}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Stop</dt>
                <dd className={p.stopLossPrice ? 'text-neg' : 'text-fg-subtle'}>{p.stopLossPrice ? price(p.stopLossPrice) : '—'}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Liq.</dt>
                <dd className="text-warn">{p.liquidationPrice > 0 ? price(p.liquidationPrice) : '—'}</dd>
              </div>
            </dl>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'risk', position: p })}>TP/SL</Button>
              <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'close', position: p })}>Partial</Button>
              <Button size="sm" variant="danger-soft" loading={busy === p.symbol} onClick={() => closeNow(p)}>Close</Button>
            </div>
          </li>
        ))}
      </ul>

      <PositionDialog state={dialog} onClose={() => setDialog(null)} onDone={onRefresh} />
    </>
  );
}

export function OpenOrdersTable({ orders, onRefresh }) {
  const confirm = useConfirm();
  const { notify } = useNotify();
  const [busy, setBusy] = useState(null);

  const cancel = async (order) => {
    const ok = await confirm({
      title: `Cancel ${order.symbol} order?`,
      description: `${order.side === 'buy' ? 'Buy' : 'Sell'} ${quantity(order.amount)} at ${price(order.price)}.`,
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(order.id);
    try {
      await futuresAction('cancelOrder', { symbol: order.symbol, orderId: order.id });
      notify({ level: 'success', title: 'Order cancelled', message: order.symbol });
      onRefresh?.();
    } catch (err) {
      notify({ level: 'danger', title: 'Cancel failed', message: err.message });
    } finally {
      setBusy(null);
    }
  };

  if (!orders?.length) return null;

  return (
    <Table>
      <THead>
        <Th>Symbol</Th>
        <Th>Type</Th>
        <Th align="right">Price</Th>
        <Th align="right">Amount</Th>
        <Th align="right">Filled</Th>
        <Th align="right">Value</Th>
        <Th align="right"><span className="sr-only">Actions</span></Th>
      </THead>
      <tbody>
        {orders.map((o) => (
          <Tr key={o.id}>
            <Td>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-fg">{base(o.symbol)}</span>
                <SideBadge side={o.side} />
                {o.reduceOnly && <Badge tone="outline">Reduce only</Badge>}
              </div>
            </Td>
            <Td className="capitalize text-fg-muted">{String(o.type).replace(/_/g, ' ')}</Td>
            <Td align="right">{price(o.price || o.stopPrice)}</Td>
            <Td align="right">{quantity(o.amount)}</Td>
            <Td align="right" className="text-fg-muted">{o.amount ? percent((o.filled / o.amount) * 100, { decimals: 0 }) : '—'}</Td>
            <Td align="right">{usd(o.amount * (o.price || o.stopPrice))}</Td>
            <Td align="right">
              <Button size="xs" variant="ghost" loading={busy === o.id} onClick={() => cancel(o)}>
                {busy !== o.id && <IconXCircle size={13} />}
                Cancel
              </Button>
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
