'use client';

import { useState } from 'react';
import { Button, Callout, ChipRow, Dialog, Field, Input, Segmented } from '@/components/ui';
import { futuresAction, pnlAtPrice, priceForPnl } from '@/lib/futures-client';
import { price as fmtPrice, quantity as fmtQty, signedUsd, TONE_TEXT, toneOf } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useNotify } from '@/lib/notify';

const PCT_CHIPS = [25, 50, 75, 100].map((v) => ({ value: v, label: `${v}%` }));

function Row({ label, children, className }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[13px]">
      <span className="text-fg-muted">{label}</span>
      <span className={cn('num font-medium text-fg', className)}>{children}</span>
    </div>
  );
}

function ClosePositionForm({ position, onClose, onDone }) {
  const { notify } = useNotify();
  const [pct, setPct] = useState(100);
  const [type, setType] = useState('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const total = Math.abs(Number(position.positionAmt));
  const closeQty = Number(((total * pct) / 100).toFixed(8));
  const exitPrice = type === 'limit' && Number(limitPrice) > 0 ? Number(limitPrice) : Number(position.markPrice);
  const estPnl = pnlAtPrice(position, exitPrice, closeQty);

  const submit = async () => {
    if (!(closeQty > 0)) return;
    if (type === 'limit' && !(Number(limitPrice) > 0)) {
      setError('Enter a limit price or switch to market.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await futuresAction('closePosition', {
        symbol: position.symbol,
        side: position.side,
        quantity: closeQty,
        limitPrice: type === 'limit' ? Number(limitPrice) : undefined,
      });
      notify({
        level: 'success',
        title: type === 'limit' ? 'Limit exit placed' : 'Position reduced',
        message: `${position.symbol} · ${pct}% (${fmtQty(closeQty)})`,
      });
      onDone?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Close ${position.symbol}`}
      description={`${position.side === 'LONG' ? 'Long' : 'Short'} · ${fmtQty(total)} contracts · entry ${fmtPrice(position.entryPrice)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="danger" onClick={submit} loading={submitting}>
            {type === 'limit' ? 'Place limit exit' : pct === 100 ? 'Close position' : `Close ${pct}%`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          block
          ariaLabel="Exit type"
          value={type}
          onChange={setType}
          options={[
            { value: 'market', label: 'Market' },
            { value: 'limit', label: 'Limit' },
          ]}
        />

        <Field label="Amount" aside={<span className="num">{pct}%</span>}>
          {(id) => (
            <div className="space-y-2">
              <input
                id={id}
                type="range"
                min="1"
                max="100"
                value={pct}
                onChange={(e) => setPct(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
              <ChipRow options={PCT_CHIPS} value={pct} onSelect={setPct} />
            </div>
          )}
        </Field>

        {type === 'limit' && (
          <Field label="Limit price" aside={<button type="button" className="text-accent hover:underline" onClick={() => setLimitPrice(String(position.markPrice))}>Use mark</button>}>
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={fmtPrice(position.markPrice)}
                suffix="USDT"
              />
            )}
          </Field>
        )}

        <div className="rounded-md border border-line bg-surface-2 px-3 py-1">
          <Row label="Quantity">{fmtQty(closeQty)}</Row>
          <Row label={type === 'limit' ? 'Exit price' : 'Mark price'}>{fmtPrice(exitPrice)}</Row>
          <Row label="Estimated PnL" className={TONE_TEXT[toneOf(estPnl)]}>{signedUsd(estPnl)}</Row>
        </div>

        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Dialog>
  );
}

function EditRiskForm({ position, onClose, onDone }) {
  const { notify } = useNotify();
  const [mode, setMode] = useState('usdt');
  const [tpUsdt, setTpUsdt] = useState(position.takeProfitValue ? Math.abs(position.takeProfitValue).toFixed(2) : '');
  const [slUsdt, setSlUsdt] = useState(position.stopLossValue ? Math.abs(position.stopLossValue).toFixed(2) : '');
  const [tpPrice, setTpPrice] = useState(position.takeProfitPrice ? String(position.takeProfitPrice) : '');
  const [slPrice, setSlPrice] = useState(position.stopLossPrice ? String(position.stopLossPrice) : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const entry = Number(position.entryPrice);
  const isLong = position.side === 'LONG';

  const resolved = () => {
    if (mode === 'usdt') {
      const tp = Number(tpUsdt) > 0 ? priceForPnl(position, Number(tpUsdt)) : null;
      const sl = Number(slUsdt) > 0 ? priceForPnl(position, -Number(slUsdt)) : null;
      if (Number(tpUsdt) > 0 && !tp) return { error: 'Target amount is too large for this position.' };
      if (Number(slUsdt) > 0 && !sl) return { error: 'Stop amount is too large for this position.' };
      return { tp, sl };
    }
    const tp = Number(tpPrice) > 0 ? Number(tpPrice) : null;
    const sl = Number(slPrice) > 0 ? Number(slPrice) : null;
    if (tp && (isLong ? tp <= entry : tp >= entry)) {
      return { error: `Target must be ${isLong ? 'above' : 'below'} entry (${fmtPrice(entry)}).` };
    }
    if (sl && (isLong ? sl >= entry : sl <= entry)) {
      return { error: `Stop must be ${isLong ? 'below' : 'above'} entry (${fmtPrice(entry)}).` };
    }
    return { tp, sl };
  };

  const preview = resolved();

  const submit = async () => {
    if (preview.error) {
      setError(preview.error);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await futuresAction('updateRisk', {
        symbol: position.symbol,
        side: position.side,
        stopLossPrice: preview.sl,
        takeProfitPrice: preview.tp,
      });
      notify({ level: 'success', title: 'Exits updated', message: position.symbol });
      onDone?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Target and stop · ${position.symbol}`}
      description={`Entry ${fmtPrice(entry)} · mark ${fmtPrice(position.markPrice)}. Leave a field empty to remove that exit.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={submitting}>Save exits</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          block
          ariaLabel="Input mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'usdt', label: 'By amount (USDT)' },
            { value: 'price', label: 'By price' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          {mode === 'usdt' ? (
            <>
              <Field label="Target profit" hint={preview.tp ? `Trigger ≈ ${fmtPrice(preview.tp)}` : 'No target'}>
                {(id) => <Input id={id} type="number" inputMode="decimal" min="0" step="0.01" value={tpUsdt} onChange={(e) => setTpUsdt(e.target.value)} suffix="USDT" />}
              </Field>
              <Field label="Stop loss" hint={preview.sl ? `Trigger ≈ ${fmtPrice(preview.sl)}` : 'No stop'}>
                {(id) => <Input id={id} type="number" inputMode="decimal" min="0" step="0.01" value={slUsdt} onChange={(e) => setSlUsdt(e.target.value)} suffix="USDT" />}
              </Field>
            </>
          ) : (
            <>
              <Field label="Target price" hint={preview.tp ? signedUsd(pnlAtPrice(position, preview.tp)) : 'No target'}>
                {(id) => <Input id={id} type="number" inputMode="decimal" min="0" step="any" value={tpPrice} onChange={(e) => setTpPrice(e.target.value)} />}
              </Field>
              <Field label="Stop price" hint={preview.sl ? signedUsd(pnlAtPrice(position, preview.sl)) : 'No stop'}>
                {(id) => <Input id={id} type="number" inputMode="decimal" min="0" step="any" value={slPrice} onChange={(e) => setSlPrice(e.target.value)} />}
              </Field>
            </>
          )}
        </div>
        {(error || preview.error) && <Callout tone="danger">{error || preview.error}</Callout>}
      </div>
    </Dialog>
  );
}

/** Mounts the dialog for `{ kind: 'close' | 'risk', position }` or nothing. */
export function PositionDialog({ state, onClose, onDone }) {
  if (!state) return null;
  const key = `${state.kind}-${state.position.symbol}`;
  if (state.kind === 'close') return <ClosePositionForm key={key} position={state.position} onClose={onClose} onDone={onDone} />;
  if (state.kind === 'risk') return <EditRiskForm key={key} position={state.position} onClose={onClose} onDone={onDone} />;
  return null;
}
