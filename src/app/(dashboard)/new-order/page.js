'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge, Button, Callout, Card, ChipRow, Field, Input, Progress, Segmented, Skeleton } from '@/components/ui';
import { useAppConfig, usePortfolioSettings } from '@/components/providers/app-data';
import { useFuturesStream } from '@/components/providers/futures-stream';
import { useGoal } from '@/components/shell/goal-summary';
import { MarketList } from '@/components/trading/market-list';
import { TradingViewChart, CHART_INTERVALS } from '@/components/trading/tradingview-chart';
import { useApi } from '@/lib/use-api';
import { futuresAction } from '@/lib/futures-client';
import { estimateLiquidation, maintenanceTier, normalizeOrderQuantity, pricePrecisionOf, triggerPriceFromUsdt } from '@/lib/order-math';
import { compactUsd, percent, price as fmtPrice, quantity as fmtQty, usd } from '@/lib/format';
import { useNotify } from '@/lib/notify';
import { TRADIFI_NAMES } from '@/lib/tradfi';
import { cn } from '@/lib/cn';

const TICKER_REFRESH_MS = 3000;
const LEVERAGE_PRESETS = [5, 10, 20, 50, 75, 100];
const MARGIN_PCT_CHIPS = [10, 25, 50, 100].map((v) => ({ value: v, label: `${v}%` }));
const DEFAULT_TP_PCT = 0.05;
const DEFAULT_SL_PCT = 0.1;

function SummaryRow({ label, children, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
      <span className="text-fg-muted">{label}</span>
      <span className={cn('num text-right font-medium', tone || 'text-fg')}>{children}</span>
    </div>
  );
}

function MarketHeader({ symbol, info, ticker }) {
  const name = TRADIFI_NAMES[info?.baseAsset];
  const change = ticker?.change24h;
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-[15px] font-semibold tracking-tight text-fg">{info?.baseAsset || symbol.replace(/USDT$/, '')}</h1>
          <Badge tone="outline">Perp</Badge>
        </div>
        <p className="text-xs text-fg-subtle">{name || symbol}</p>
      </div>
      {ticker ? (
        <dl className="num flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <div>
            <dt className="text-fg-subtle">Last</dt>
            <dd className="text-[15px] font-semibold text-fg">{fmtPrice(ticker.lastPrice)}</dd>
          </div>
          <div>
            <dt className="text-fg-subtle">24h</dt>
            <dd className={cn('font-medium', change >= 0 ? 'text-pos' : 'text-neg')}>{percent(change, { signed: true })}</dd>
          </div>
          <div className="hidden sm:block">
            <dt className="text-fg-subtle">Mark</dt>
            <dd className="text-fg">{fmtPrice(ticker.markPrice)}</dd>
          </div>
          <div className="hidden md:block">
            <dt className="text-fg-subtle">24h high / low</dt>
            <dd className="text-fg">{fmtPrice(ticker.high24h)} / {fmtPrice(ticker.low24h)}</dd>
          </div>
          <div className="hidden md:block">
            <dt className="text-fg-subtle">Volume</dt>
            <dd className="text-fg">{compactUsd(ticker.volume24h)}</dd>
          </div>
          <div className="hidden lg:block">
            <dt className="text-fg-subtle">Funding</dt>
            <dd className={ticker.fundingRate >= 0 ? 'text-fg' : 'text-neg'}>{percent(ticker.fundingRate * 100, { decimals: 4 })}</dd>
          </div>
        </dl>
      ) : (
        <Skeleton className="h-8 w-64" />
      )}
    </div>
  );
}

function OrderTicket({ symbol, info, currentPrice, symbolsLoading }) {
  const config = useAppConfig();
  const settings = usePortfolioSettings();
  const { account, refetch, dailyRisk } = useFuturesStream();
  const goal = useGoal();
  const { notify } = useNotify();

  const maxLev = config.trading.maxLeverage;
  const limitAllowed = config.trading.limitOrdersEnabled;

  const [side, setSide] = useState('BUY');
  const [orderType, setOrderType] = useState('MARKET');
  const [limitInput, setLimitInput] = useState({ symbol: null, value: '' });
  const [leverage, setLeverage] = useState(() => String(Math.min(Number(settings.defaultLeverage) || 10, maxLev)));
  const [margin, setMargin] = useState('100');
  const [riskMode, setRiskMode] = useState('usdt');
  const [tpUsdt, setTpUsdt] = useState(null);
  const [slUsdt, setSlUsdt] = useState(null);
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const type = limitAllowed ? orderType : 'MARKET';
  const isLimit = type === 'LIMIT';
  // The limit price follows the market until edited for this symbol.
  const limitPrice = limitInput.symbol === symbol ? limitInput.value : currentPrice > 0 ? String(currentPrice) : '';
  const available = Number(account?.availableBalance) || 0;
  const lev = Math.min(Number(leverage) || 0, maxLev);
  const marginNum = Number(margin) || 0;
  const notional = marginNum > 0 && lev > 0 ? marginNum * lev : 0;
  const sizingPrice = isLimit && Number(limitPrice) > 0 ? Number(limitPrice) : currentPrice;
  const quantity = sizingPrice > 0 && notional > 0 ? normalizeOrderQuantity(notional / sizingPrice, info) : 0;

  const tpValue = tpUsdt ?? (notional > 0 ? (notional * DEFAULT_TP_PCT).toFixed(2) : '');
  const slValue = slUsdt ?? (notional > 0 ? (notional * DEFAULT_SL_PCT).toFixed(2) : '');
  const tpPreview = riskMode === 'usdt' ? triggerPriceFromUsdt({ usdt: tpValue, side, quantity, entryPrice: currentPrice, kind: 'tp' }) : null;
  const slPreview = riskMode === 'usdt' ? triggerPriceFromUsdt({ usdt: slValue, side, quantity, entryPrice: currentPrice, kind: 'sl' }) : null;

  const liq = estimateLiquidation({ entry: currentPrice, margin: marginNum, leverage: lev, balance: available, side });
  const liqDistance = liq && currentPrice > 0 ? Math.abs((liq - currentPrice) / currentPrice) * 100 : null;
  const marginPct = available > 0 ? Math.min(100, Math.round((marginNum / available) * 100)) : 0;
  const levPresets = LEVERAGE_PRESETS.filter((v) => v < maxLev).map((v) => ({ value: v, label: `${v}x` }));
  const precision = pricePrecisionOf(info);
  const breakerBlocks = dailyRisk.breakerTripped && lev < 20 && Number(settings.allowOrdersAfterBreach) !== 1;
  const tradingOff = !config.trading.enabled;

  const setRiskPct = (kind, pct) => {
    if (!(notional > 0)) return;
    const value = (notional * pct / 100).toFixed(2);
    if (kind === 'tp') setTpUsdt(value);
    else setSlUsdt(value);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setResult(null);

    if (!symbol) return setError('Pick a market first.');
    if (!(lev >= 1 && lev <= maxLev)) return setError(`Leverage must be between 1x and ${maxLev}x.`);
    if (!(marginNum > 0)) return setError('Enter a margin amount.');
    if (!(currentPrice > 0)) return setError('Live price unavailable for this market. Try again in a moment.');

    const limit = Number(limitPrice);
    if (isLimit && !(limit > 0)) return setError('Enter a valid limit price.');

    const qty = normalizeOrderQuantity((marginNum * lev) / (isLimit ? limit : currentPrice), info);
    if (!(qty > 0)) return setError('Quantity rounds to zero for this market. Increase the margin.');
    const minQty = Number(info?.minQty);
    if (minQty > 0 && qty < minQty) return setError(`Quantity ${qty} is below the ${minQty} minimum for ${symbol}.`);

    let sl = null;
    let tp = null;
    if (riskMode === 'price') {
      sl = slPrice.trim() ? Number(slPrice) : null;
      tp = tpPrice.trim() ? Number(tpPrice) : null;
      if (sl !== null && !(sl > 0)) return setError('Stop price must be a positive number.');
      if (tp !== null && !(tp > 0)) return setError('Target price must be a positive number.');
      const ref = isLimit ? limit : currentPrice;
      if (sl !== null && (side === 'BUY' ? sl >= ref : sl <= ref)) {
        return setError(`Stop must be ${side === 'BUY' ? 'below' : 'above'} entry (${fmtPrice(ref)}).`);
      }
      if (tp !== null && (side === 'BUY' ? tp <= ref : tp >= ref)) {
        return setError(`Target must be ${side === 'BUY' ? 'above' : 'below'} entry (${fmtPrice(ref)}).`);
      }
    } else {
      const slAmt = String(slValue).trim() ? Number(slValue) : null;
      const tpAmt = String(tpValue).trim() ? Number(tpValue) : null;
      if (slAmt !== null && !(slAmt > 0)) return setError('Stop amount must be positive, or leave it empty.');
      if (tpAmt !== null && !(tpAmt > 0)) return setError('Target amount must be positive, or leave it empty.');
      sl = slAmt === null ? null : triggerPriceFromUsdt({ usdt: slAmt, side, quantity: qty, entryPrice: currentPrice, kind: 'sl' });
      tp = tpAmt === null ? null : triggerPriceFromUsdt({ usdt: tpAmt, side, quantity: qty, entryPrice: currentPrice, kind: 'tp' });
      if (slAmt !== null && !sl) return setError('Stop amount is too large for this position.');
      if (tpAmt !== null && !tp) return setError('Target amount is too large for this position.');
    }

    setSubmitting(true);
    try {
      const data = await futuresAction('openPosition', {
        symbol,
        side,
        quantity: qty,
        leverage: lev,
        orderType: type,
        limitPrice: isLimit ? limit : undefined,
        stopLossPrice: sl === null ? null : Number(sl.toFixed(precision)),
        takeProfitPrice: tp === null ? null : Number(tp.toFixed(precision)),
        pricePrecision: info?.pricePrecision,
      });
      setResult(data);
      notify({
        level: 'success',
        title: `${side === 'BUY' ? 'Long' : 'Short'} ${symbol} ${isLimit ? 'placed' : 'filled'}`,
        message: `${fmtQty(qty)} at ${data?.leverage?.leverage || lev}x`,
      });
      refetch();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 p-4">
      <Segmented
        block
        size="md"
        ariaLabel="Side"
        value={side}
        onChange={setSide}
        options={[
          { value: 'BUY', label: 'Long', tone: 'pos' },
          { value: 'SELL', label: 'Short', tone: 'neg' },
        ]}
      />

      {limitAllowed && (
        <Segmented
          block
          ariaLabel="Order type"
          value={type}
          onChange={setOrderType}
          options={[
            { value: 'MARKET', label: 'Market' },
            { value: 'LIMIT', label: 'Limit' },
          ]}
        />
      )}

      {isLimit && (
        <Field
          label="Limit price"
          hint="Rests until filled. Target and stop attach once it fills."
          aside={
            <button type="button" className="text-accent hover:underline" onClick={() => setLimitInput({ symbol: null, value: '' })}>
              Use last
            </button>
          }
        >
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              value={limitPrice}
              onChange={(e) => setLimitInput({ symbol, value: e.target.value })}
              suffix="USDT"
            />
          )}
        </Field>
      )}

      <Field
        label="Leverage"
        aside={
          <span className="flex items-center gap-1">
            <input
              type="number"
              min="1"
              max={maxLev}
              value={leverage}
              onChange={(e) => setLeverage(e.target.value)}
              className="num h-6 w-12 rounded border border-line bg-surface-2 text-center text-xs text-fg outline-none focus:border-accent"
              aria-label="Leverage value"
            />
            <span>x</span>
          </span>
        }
      >
        {(id) => (
          <div className="space-y-2">
            <input
              id={id}
              type="range"
              min="1"
              max={maxLev}
              value={lev || 1}
              onChange={(e) => setLeverage(e.target.value)}
              className="w-full cursor-pointer"
            />
            <ChipRow
              options={[...levPresets, { value: maxLev, label: `Max ${maxLev}x` }]}
              value={lev}
              onSelect={(v) => setLeverage(String(v))}
            />
          </div>
        )}
      </Field>

      <Field label="Margin" aside={<span className="num">Available {usd(available)}</span>}>
        {(id) => (
          <div className="space-y-2">
            <Input id={id} type="number" inputMode="decimal" min="0" step="any" value={margin} onChange={(e) => setMargin(e.target.value)} suffix="USDT" />
            <input
              type="range"
              min="0"
              max="100"
              value={marginPct}
              aria-label="Margin as percent of available balance"
              onChange={(e) => available > 0 && setMargin(((available * Number(e.target.value)) / 100).toFixed(2))}
              className="w-full cursor-pointer"
            />
            <ChipRow
              options={MARGIN_PCT_CHIPS}
              value={marginPct}
              onSelect={(pct) => available > 0 && setMargin(((available * pct) / 100).toFixed(2))}
              disabled={!(available > 0)}
            />
          </div>
        )}
      </Field>

      <div className="rounded-md border border-line bg-surface-2 px-3 py-1.5">
        <SummaryRow label="Position size">{usd(notional)}</SummaryRow>
        <SummaryRow label="Quantity">{quantity > 0 ? fmtQty(quantity) : '—'}</SummaryRow>
        <SummaryRow label="Est. liquidation" tone="text-warn">
          {liq ? (
            <>
              {fmtPrice(liq)}
              <span className="ml-1.5 text-xs font-normal text-fg-subtle">{liqDistance.toFixed(1)}% away</span>
            </>
          ) : (
            '—'
          )}
        </SummaryRow>
        <SummaryRow label="Margin of balance" tone={marginPct >= 50 ? 'text-warn' : undefined}>
          {available > 0 ? `${((marginNum / available) * 100).toFixed(1)}%` : '—'}
        </SummaryRow>
        {notional > 0 && (
          <p className="num pb-1 text-[11px] text-fg-subtle">Maintenance rate {(maintenanceTier(notional).mmr * 100).toFixed(2)}%</p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-fg-muted">Target and stop</span>
          <Segmented
            size="xs"
            ariaLabel="Exit input"
            value={riskMode}
            onChange={setRiskMode}
            options={[
              { value: 'usdt', label: 'USDT' },
              { value: 'price', label: 'Price' },
            ]}
          />
        </div>
        {riskMode === 'usdt' ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field hint={tpPreview ? `at ${fmtPrice(tpPreview)}` : 'No target'}>
                {(id) => (
                  <Input id={id} aria-label="Target profit in USDT" type="number" inputMode="decimal" min="0" step="any" value={tpValue} onChange={(e) => setTpUsdt(e.target.value)} prefix="TP" />
                )}
              </Field>
              <Field hint={slPreview ? `at ${fmtPrice(slPreview)}` : 'No stop'}>
                {(id) => (
                  <Input id={id} aria-label="Stop loss in USDT" type="number" inputMode="decimal" min="0" step="any" value={slValue} onChange={(e) => setSlUsdt(e.target.value)} prefix="SL" />
                )}
              </Field>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[1, 2].map((p) => (
                <Button key={`tp${p}`} size="xs" variant="secondary" className="text-pos" onClick={() => setRiskPct('tp', p)}>TP {p}%</Button>
              ))}
              {[1, 2].map((p) => (
                <Button key={`sl${p}`} size="xs" variant="secondary" className="text-neg" onClick={() => setRiskPct('sl', p)}>SL {p}%</Button>
              ))}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Input aria-label="Target price" type="number" inputMode="decimal" min="0" step="any" placeholder="Target price" value={tpPrice} onChange={(e) => setTpPrice(e.target.value)} />
            <Input aria-label="Stop price" type="number" inputMode="decimal" min="0" step="any" placeholder="Stop price" value={slPrice} onChange={(e) => setSlPrice(e.target.value)} />
          </div>
        )}
      </div>

      {tradingOff && <Callout tone="warn">New entries are paused by the administrator.</Callout>}
      {!tradingOff && breakerBlocks && (
        <Callout tone="danger" title="Daily loss limit reached">Entries under 20x are rejected until 00:00 UTC.</Callout>
      )}
      {error && <Callout tone="danger">{error}</Callout>}
      {result && (
        <Callout tone="success" title={`Order ${result.order?.orderId ?? ''} placed`}>
          {result.order?.symbol} · executed {result.order?.executedQty ?? '0'} · {result.leverage?.leverage ?? lev}x
        </Callout>
      )}

      <Button
        type="submit"
        size="lg"
        block
        variant={side === 'BUY' ? 'buy' : 'sell'}
        loading={submitting}
        disabled={symbolsLoading || tradingOff}
      >
        {side === 'BUY' ? 'Long' : 'Short'} {symbol.replace(/USDT$/, '')} · {isLimit ? 'Limit' : 'Market'}
      </Button>

      {goal.current && (
        <div className="rounded-md border border-line p-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-fg">Goal milestone {goal.current.trade}</span>
            <span className="num text-fg-muted">{goal.remaining} left</span>
          </div>
          <Progress value={goal.progress} className="mt-2" />
          <div className="num mt-2 flex items-baseline justify-between text-xs">
            <span className="text-fg-muted">
              {usd(goal.current.startBalance, 0)} to {usd(goal.current.endBalance, 0)}
            </span>
            <button
              type="button"
              className="font-medium text-accent hover:underline"
              onClick={() => {
                setRiskMode('usdt');
                setTpUsdt(goal.current.profit.toFixed(2));
              }}
            >
              Use +{usd(goal.current.profit)} target
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function NewOrder() {
  const params = useSearchParams();
  const [picked, setPicked] = useState(() => (params.get('symbol') || 'BTCUSDT').toUpperCase());
  const [chartInterval, setChartInterval] = useState('60');

  const symbolsQuery = useApi('/api/futures?type=symbols');
  const symbols = useMemo(() => symbolsQuery.data || [], [symbolsQuery.data]);
  const symbol = symbols.length && !symbols.some((s) => s.symbol === picked) ? 'BTCUSDT' : picked;
  const info = useMemo(() => symbols.find((s) => s.symbol === symbol), [symbols, symbol]);

  const ticker = useApi(`/api/futures?type=ticker&symbol=${symbol}`, { refreshMs: TICKER_REFRESH_MS });
  const currentPrice = Number(ticker.data?.lastPrice) || Number(ticker.data?.markPrice) || 0;

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:p-6 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
      <Card className="order-3 h-[560px] overflow-hidden lg:col-span-2 xl:order-1 xl:col-span-1 xl:h-auto xl:max-h-[calc(100dvh-7.5rem)]">
        <MarketList
          className="h-full"
          symbols={symbols}
          symbolsLoading={symbolsQuery.loading}
          symbolsError={symbolsQuery.error}
          selected={symbol}
          onSelect={setPicked}
        />
      </Card>

      <Card className="order-1 flex min-h-[520px] flex-col overflow-hidden xl:order-2">
        <MarketHeader symbol={symbol} info={info} ticker={ticker.data?.symbol === symbol ? ticker.data : null} />
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <span className="text-xs text-fg-subtle">Chart</span>
          <Segmented size="xs" ariaLabel="Interval" value={chartInterval} onChange={setChartInterval} options={CHART_INTERVALS} />
        </div>
        <div className="min-h-[460px] flex-1">
          <TradingViewChart symbol={symbol} interval={chartInterval} />
        </div>
      </Card>

      <Card className="order-2 self-start xl:order-3">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-semibold text-fg">Order</h2>
        </div>
        <OrderTicket symbol={symbol} info={info} currentPrice={currentPrice} symbolsLoading={symbolsQuery.loading} />
      </Card>
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={null}>
      <NewOrder />
    </Suspense>
  );
}
