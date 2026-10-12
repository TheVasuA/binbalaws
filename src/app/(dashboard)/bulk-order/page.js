'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Callout, Card, CardHeader, ChipRow, EmptyState, Field, Input, Segmented, Skeleton, Switch } from '@/components/ui';
import { IconLayers, IconSearch, IconStar, IconX } from '@/components/ui/icons';
import { useAppConfig } from '@/components/providers/app-data';
import { useFuturesStream } from '@/components/providers/futures-stream';
import { TradingViewChart, CHART_INTERVALS } from '@/components/trading/tradingview-chart';
import { useApi } from '@/lib/use-api';
import { useStored } from '@/lib/use-stored';
import { futuresAction } from '@/lib/futures-client';
import { normalizeOrderQuantity } from '@/lib/order-math';
import { percent, price as fmtPrice, quantity as fmtQty, signedUsd, TONE_TEXT, toneOf, usd } from '@/lib/format';
import { useNotify } from '@/lib/notify';
import { cn } from '@/lib/cn';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_KEY = 'bulkScalpRecentCoins';
const FAVORITES_KEY = 'bulkScalpFavorites';
const APP_OPENED_KEY = 'bulkScalpAppOpened';
const DEFAULT_TOTAL = 30_000;
const SIZE_PRESETS = [10_000, 20_000, 30_000, 40_000, 50_000, 60_000];
const LEVERAGE_PRESETS = [5, 10, 20, 25, 50];
const DEFAULT_TARGET_PCT = 0.01;
const DEFAULT_STOP_PCT_OF_WALLET = 0.2;

// Recent coins and favourites expire after a day; entries are { symbol, at }.
function fresh(entries) {
  const now = Date.now();
  return (Array.isArray(entries) ? entries : [])
    .map((e) => (typeof e === 'string' ? { symbol: e, at: now } : { symbol: e.symbol, at: Number(e.at ?? e.usedAt ?? e.favedAt) }))
    .filter((e) => e.symbol && now - e.at < DAY_MS)
    .sort((a, b) => b.at - a.at);
}

function useDayList(key) {
  const [stored, setStored] = useStored(key, []);
  const list = useMemo(() => (Array.isArray(stored) ? stored : []), [stored]);

  useEffect(() => {
    if (!Array.isArray(stored) || !stored.length) return;
    const pruned = fresh(stored);
    if (pruned.length !== stored.length) setStored(pruned);
  }, [stored, setStored]);

  const symbols = useMemo(() => list.map((e) => (typeof e === 'string' ? e : e.symbol)), [list]);
  const add = useCallback((syms) => {
    const now = Date.now();
    const kept = fresh(list).filter((e) => !syms.includes(e.symbol));
    setStored([...syms.map((symbol) => ({ symbol, at: now })), ...kept].slice(0, 20));
  }, [list, setStored]);
  const remove = useCallback((sym) => setStored(fresh(list).filter((e) => e.symbol !== sym)), [list, setStored]);
  return { symbols, add, remove };
}

function CoinChip({ sym, active, dim, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(sym)}
      aria-pressed={active}
      className={cn(
        'h-6 rounded border px-2 text-xs font-medium transition-colors',
        active ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
        !active && dim && 'opacity-50',
      )}
    >
      {sym.replace(/USDT$/, '')}
    </button>
  );
}

function CoinPicker({ selected, onToggle, maxCoins, favorites, recent }) {
  const [search, setSearch] = useState('');
  const symbolsQuery = useApi('/api/futures?type=symbols');
  const gainers = useApi('/api/futures?type=topgainers&limit=200&minVol=200000000', { refreshMs: 60_000 });

  const rank = useMemo(() => {
    const map = new Map();
    (gainers.data || []).forEach((g, i) => map.set(g.symbol, { i, change: g.change24hPercent }));
    return map;
  }, [gainers.data]);

  const rows = useMemo(() => {
    const usdt = (symbolsQuery.data || []).filter((s) => s.quoteAsset === 'USDT');
    const keyword = search.trim().toUpperCase();
    const byRank = (a, b) => (rank.get(a.symbol)?.i ?? Infinity) - (rank.get(b.symbol)?.i ?? Infinity) || a.symbol.localeCompare(b.symbol);
    if (keyword) {
      return usdt.filter((s) => s.symbol.includes(keyword) || s.baseAsset.includes(keyword)).sort(byRank).slice(0, 80);
    }
    return usdt.filter((s) => rank.has(s.symbol)).sort(byRank);
  }, [symbolsQuery.data, search, rank]);

  const loading = symbolsQuery.loading || (gainers.loading && !gainers.data);
  const full = selected.length >= maxCoins;
  const chip = (sym) => <CoinChip key={sym} sym={sym} active={selected.includes(sym)} dim={full} onToggle={onToggle} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-line p-3">
        <Input
          size="sm"
          prefix={<IconSearch size={13} />}
          placeholder="Search coin"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search coins"
        />
        {favorites.symbols.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">Favorites</p>
            <div className="flex flex-wrap gap-1">{favorites.symbols.map(chip)}</div>
          </div>
        )}
        {recent.symbols.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">Used today</p>
            <div className="flex flex-wrap gap-1">{recent.symbols.map(chip)}</div>
          </div>
        )}
      </div>
      <p className="border-b border-line px-3 py-2 text-xs text-fg-subtle">
        {search.trim() ? `${rows.length} matches` : 'Top gainers today, $200M+ volume'}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-3">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-7" />)}</div>
        ) : rows.length === 0 ? (
          <p className="p-4 text-center text-[13px] text-fg-muted">{search.trim() ? 'No matching coins.' : 'No gainers above the volume floor. Search for a coin.'}</p>
        ) : (
          rows.map((s) => {
            const active = selected.includes(s.symbol);
            const fav = favorites.symbols.includes(s.symbol);
            const change = rank.get(s.symbol)?.change;
            return (
              <div key={s.symbol} className={cn('flex items-center', active ? 'bg-accent/10' : 'hover:bg-surface-2')}>
                <button
                  type="button"
                  onClick={() => (fav ? favorites.remove(s.symbol) : favorites.add([s.symbol]))}
                  className={cn('py-2 pl-3 pr-1.5', fav ? 'text-warn' : 'text-fg-subtle hover:text-warn')}
                  aria-label={fav ? `Remove ${s.baseAsset} from favorites` : `Add ${s.baseAsset} to favorites`}
                  aria-pressed={fav}
                >
                  <IconStar size={13} filled={fav} />
                </button>
                <button
                  type="button"
                  onClick={() => onToggle(s.symbol)}
                  aria-pressed={active}
                  className={cn('flex flex-1 items-center justify-between py-2 pr-3 text-left text-[13px]', !active && full && 'opacity-50')}
                >
                  <span className={cn('font-medium', active ? 'text-accent' : 'text-fg')}>{s.baseAsset}</span>
                  <span className={cn('num text-xs', TONE_TEXT[toneOf(change)])}>{Number.isFinite(change) ? percent(change, { signed: true }) : ''}</span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function BulkOrderPage() {
  const config = useAppConfig();
  const { account, positions, loaded, refetch } = useFuturesStream();
  const { notify } = useNotify();

  const bulk = config.trading.bulk;
  const maxLev = Math.min(bulk.maxLeverage, config.trading.maxLeverage);

  const favorites = useDayList(FAVORITES_KEY);
  const recent = useDayList(RECENT_KEY);
  const [appOpened, setAppOpened] = useStored(APP_OPENED_KEY, {});

  const [selected, setSelected] = useState([]);
  const [chartSymbol, setChartSymbol] = useState(null);
  const [chartInterval, setChartInterval] = useState('60');
  const [side, setSide] = useState('BUY');
  const [leverage, setLeverage] = useState(Math.min(10, maxLev));
  const [perCoinInput, setPerCoinInput] = useState(null);
  const [targetInput, setTargetInput] = useState(null);
  const [stopInput, setStopInput] = useState(null);
  const [armedInput, setArmedInput] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState(null);
  const [openedBasketId, setOpenedBasketId] = useState(null);

  const baskets = useApi('/api/futures?type=baskets', { refreshMs: 5000 });
  const prices = useApi(selected.length ? `/api/futures?type=prices&symbols=${selected.join(',')}` : null, { refreshMs: 5000 });
  const symbolsQuery = useApi('/api/futures?type=symbols');
  const infoMap = useMemo(() => new Map((symbolsQuery.data || []).map((s) => [s.symbol, s])), [symbolsQuery.data]);

  const lev = Math.min(Number(leverage) || 1, maxLev);
  const wallet = Number(account?.totalWalletBalance) || 0;
  const available = Number(account?.availableBalance) || 0;

  // Margin per coin defaults to a $30k total position until edited.
  const perCoin = perCoinInput ?? (selected.length ? (DEFAULT_TOTAL / (lev * selected.length)).toFixed(2) : '20');
  const totalMargin = (Number(perCoin) || 0) * selected.length;
  const totalNotional = totalMargin * lev;

  // ── Live basket: positions this app opened (symbol and side must match) ──
  const basketPositions = useMemo(
    () => positions.filter((p) => appOpened?.[p.symbol]?.side === p.side),
    [positions, appOpened],
  );
  const hasBasket = basketPositions.length > 0;
  const basketPnl = basketPositions.reduce((sum, p) => sum + (Number(p.unrealizedProfit) || 0), 0);

  const serverBasket = useMemo(() => {
    const list = baskets.data || [];
    if (openedBasketId) return list.find((b) => b.id === openedBasketId) || null;
    return list.find((b) => b.symbols?.some((s) => appOpened?.[s])) || null;
  }, [baskets.data, openedBasketId, appOpened]);
  const basketId = hasBasket ? serverBasket?.id || openedBasketId : null;

  // Thresholds: user edit > live server basket > defaults.
  const defaultTarget = totalNotional > 0 ? (totalNotional * DEFAULT_TARGET_PCT).toFixed(2) : '';
  const defaultStop = wallet > 0 ? (wallet * DEFAULT_STOP_PCT_OF_WALLET).toFixed(2) : '';
  const target = targetInput ?? (hasBasket && serverBasket ? String(serverBasket.targetUsdt ?? '') : defaultTarget);
  const stop = stopInput ?? (hasBasket && serverBasket ? String(serverBasket.stopUsdt ?? '') : defaultStop);
  const armed = armedInput ?? (hasBasket && serverBasket ? serverBasket.armed !== false : true);

  // Forget app-opened entries whose position has closed. New entries get a
  // grace period: the stream can lag the fill by a few seconds.
  const liveKey = positions.map((p) => `${p.symbol}:${p.side}`).sort().join('|');
  useEffect(() => {
    if (!loaded || !appOpened) return;
    const live = new Set(liveKey ? liveKey.split('|') : []);
    const graceStart = Date.now() - 60_000;
    const next = Object.fromEntries(
      Object.entries(appOpened).filter(([sym, rec]) => live.has(`${sym}:${rec.side}`) || Number(rec.openedAt) > graceStart),
    );
    if (Object.keys(next).length !== Object.keys(appOpened).length) setAppOpened(next);
  }, [liveKey, loaded, appOpened, setAppOpened]);

  // Push threshold edits to the server basket (debounced) so the watcher uses them.
  const syncTimer = useRef(null);
  const syncBasket = (patch) => {
    if (!basketId) return;
    clearTimeout(syncTimer.current);
    const values = { targetUsdt: Number(target) || null, stopUsdt: Number(stop) || null, armed, ...patch };
    syncTimer.current = setTimeout(() => {
      futuresAction('updateBasket', { basketId, ...values }).catch(() => {});
    }, 600);
  };
  useEffect(() => () => clearTimeout(syncTimer.current), []);

  const toggleCoin = (sym) => {
    setMessage(null);
    setChartSymbol(sym);
    setSelected((prev) => {
      if (prev.includes(sym)) return prev.filter((s) => s !== sym);
      if (prev.length >= bulk.maxCoins) return prev;
      return [...prev, sym];
    });
  };

  const applyTotal = (total) => {
    if (!selected.length) return;
    setPerCoinInput(total === DEFAULT_TOTAL ? null : (total / (lev * selected.length)).toFixed(2));
  };

  const legs = selected.map((sym) => {
    const info = infoMap.get(sym);
    const p = Number(prices.data?.[sym]) || 0;
    const notional = (Number(perCoin) || 0) * lev;
    return { symbol: sym, info, price: p, notional, quantity: p > 0 ? normalizeOrderQuantity(notional / p, info) : 0 };
  });

  // ── Close every app-opened leg ───────────────────────────────────────────
  const closeBasket = useCallback(async (reason) => {
    const symbols = basketPositions.map((p) => p.symbol);
    if (!symbols.length) return;
    setClosing(true);
    try {
      const data = await futuresAction('bulkClose', { symbols, basketId });
      const next = { ...appOpened };
      symbols.forEach((s) => delete next[s]);
      setAppOpened(next);
      notify({
        level: 'success',
        beep: !!reason,
        title: reason || 'Basket closed',
        message: `${data?.closed ?? symbols.length} position${symbols.length === 1 ? '' : 's'} closed`,
      });
      refetch();
    } catch (err) {
      notify({ level: 'danger', beep: true, title: 'Basket close failed', message: err.message });
    } finally {
      setClosing(false);
    }
  }, [basketPositions, basketId, appOpened, setAppOpened, notify, refetch]);

  // Browser-side auto-exit; the server watcher does the same independently.
  const firedRef = useRef(false);
  useEffect(() => {
    if (!hasBasket) {
      firedRef.current = false;
      return;
    }
    if (!armed || closing || firedRef.current) return;
    const t = Number(target);
    const s = Number(stop);
    const hitTarget = t > 0 && basketPnl >= t;
    const hitStop = s > 0 && basketPnl <= -s;
    if (hitTarget || hitStop) {
      firedRef.current = true;
      closeBasket(hitTarget ? `Basket target hit: ${signedUsd(basketPnl)}` : `Basket stop hit: ${signedUsd(basketPnl)}`);
    }
  }, [hasBasket, armed, closing, basketPnl, target, stop, closeBasket]);

  const open = async () => {
    setMessage(null);
    if (selected.length < bulk.minCoins || selected.length > bulk.maxCoins) {
      return setMessage({ tone: 'danger', text: `Pick ${bulk.minCoins} to ${bulk.maxCoins} coins.` });
    }
    if (!(Number(perCoin) > 0)) return setMessage({ tone: 'danger', text: 'Margin per coin must be positive.' });
    for (const leg of legs) {
      if (!(leg.price > 0)) return setMessage({ tone: 'danger', text: `No live price for ${leg.symbol} yet. Try again in a moment.` });
      if (!(leg.quantity > 0)) return setMessage({ tone: 'danger', text: `${leg.symbol} quantity rounds to zero. Increase the margin.` });
      const minQty = Number(leg.info?.minQty);
      if (minQty > 0 && leg.quantity < minQty) {
        return setMessage({ tone: 'danger', text: `${leg.symbol} quantity ${leg.quantity} is below the ${minQty} minimum.` });
      }
    }

    setSubmitting(true);
    firedRef.current = false;
    try {
      const data = await futuresAction('bulkOpen', {
        legs: legs.map((l) => ({ symbol: l.symbol, side, quantity: l.quantity, leverage: lev })),
        targetUsdt: Number(target) > 0 ? Number(target) : null,
        stopUsdt: Number(stop) > 0 ? Number(stop) : null,
        armed,
      });
      if (data?.basket?.id) setOpenedBasketId(data.basket.id);
      const results = data?.results || [];
      const filled = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);
      if (filled.length) {
        recent.add(filled.map((r) => r.symbol));
        const posSide = side === 'BUY' ? 'LONG' : 'SHORT';
        const next = { ...appOpened };
        filled.forEach((r) => { next[r.symbol] = { side: posSide, openedAt: Date.now() }; });
        setAppOpened(next);
      }
      setTargetInput(null);
      setStopInput(null);
      setArmedInput(null);
      setMessage(
        failed.length
          ? { tone: 'warn', text: `Filled ${filled.length} of ${legs.length}. Failed: ${failed.map((r) => `${r.symbol} (${r.error})`).join(', ')}` }
          : { tone: 'success', text: `${side === 'BUY' ? 'Long' : 'Short'} basket opened: ${filled.length} coins at ${lev}x.` },
      );
      refetch();
    } catch (err) {
      setMessage({ tone: 'danger', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const levOptions = LEVERAGE_PRESETS.filter((v) => v <= maxLev).map((v) => ({ value: v, label: `${v}x` }));
  const ready = selected.length >= bulk.minCoins && selected.length <= bulk.maxCoins;
  const watcherLive = hasBasket && !!serverBasket;

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:p-6 2xl:grid-cols-[280px_minmax(0,1fr)_360px]">
      <Card className="h-[520px] overflow-hidden lg:sticky lg:top-[4.5rem] lg:h-[calc(100dvh-6rem)]">
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <h2 className="text-[13px] font-semibold text-fg">Coins</h2>
          <span className={cn('num text-xs', ready ? 'text-pos' : 'text-fg-muted')}>{selected.length} / {bulk.maxCoins}</span>
        </div>
        <CoinPicker selected={selected} onToggle={toggleCoin} maxCoins={bulk.maxCoins} favorites={favorites} recent={recent} />
      </Card>

      <div className="min-w-0 space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Bulk scalp</h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">
            Enter {bulk.minCoins} to {bulk.maxCoins} coins in one order and exit the whole basket on its combined PnL.
          </p>
        </div>

        {chartSymbol && (
          <Card className="overflow-hidden">
            <CardHeader
              title={chartSymbol.replace(/USDT$/, '')}
              actions={
                <>
                  <Segmented size="xs" ariaLabel="Interval" value={chartInterval} onChange={setChartInterval} options={CHART_INTERVALS} />
                  <Button size="icon-sm" variant="ghost" aria-label="Hide chart" onClick={() => setChartSymbol(null)}>
                    <IconX size={14} />
                  </Button>
                </>
              }
            />
            <div className="h-72 md:h-80">
              <TradingViewChart symbol={chartSymbol} interval={chartInterval} />
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Basket" description={`Available ${usd(available)}`} />
          <div className="space-y-5 p-4">
            {selected.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => toggleCoin(sym)}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-accent/50 bg-accent/10 px-2.5 text-xs font-medium text-accent hover:bg-accent/15"
                    aria-label={`Remove ${sym}`}
                  >
                    {sym.replace(/USDT$/, '')}
                    <IconX size={12} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-fg-muted">Pick coins from the list. Tapping a coin also opens its chart.</p>
            )}

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Direction">
                {() => (
                  <Segmented
                    block
                    size="md"
                    ariaLabel="Direction"
                    value={side}
                    onChange={setSide}
                    options={[
                      { value: 'BUY', label: 'Long all', tone: 'pos' },
                      { value: 'SELL', label: 'Short all', tone: 'neg' },
                    ]}
                  />
                )}
              </Field>
              <Field label="Leverage" aside={<span className="num">{lev}x</span>}>
                {(id) => (
                  <div className="space-y-2">
                    <input id={id} type="range" min="1" max={maxLev} value={lev} onChange={(e) => setLeverage(Number(e.target.value))} className="w-full cursor-pointer" />
                    <ChipRow options={levOptions} value={lev} onSelect={setLeverage} />
                  </div>
                )}
              </Field>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Total position" aside={<span className="num">margin {usd(totalMargin)}</span>}>
                {() => (
                  <div className="space-y-2">
                    <p className="num text-2xl font-semibold tracking-tight text-fg">{usd(totalNotional, 0)}</p>
                    <ChipRow
                      options={SIZE_PRESETS.map((v) => ({ value: v, label: `${v / 1000}k` }))}
                      value={SIZE_PRESETS.find((v) => Math.abs(totalNotional - v) < 1)}
                      onSelect={applyTotal}
                      disabled={!selected.length}
                    />
                  </div>
                )}
              </Field>
              <Field label="Margin per coin" hint={selected.length ? `${usd(Number(perCoin) * lev)} position per coin` : undefined}>
                {(id) => (
                  <Input id={id} type="number" inputMode="decimal" min="0" step="any" value={perCoin} onChange={(e) => setPerCoinInput(e.target.value)} suffix="USDT" />
                )}
              </Field>
            </div>

            {legs.length > 0 && (
              <div className="overflow-hidden rounded-md border border-line">
                <table className="w-full text-[13px]">
                  <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-fg-subtle">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Coin</th>
                      <th className="px-3 py-2 text-right font-medium">Price</th>
                      <th className="px-3 py-2 text-right font-medium">Position</th>
                      <th className="px-3 py-2 text-right font-medium">Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {legs.map((l) => (
                      <tr key={l.symbol} className="border-t border-line">
                        <td className="px-3 py-2 font-medium text-fg">{l.symbol.replace(/USDT$/, '')}</td>
                        <td className="px-3 py-2 text-right text-fg-muted">{l.price > 0 ? fmtPrice(l.price) : '—'}</td>
                        <td className="px-3 py-2 text-right">{usd(l.notional, 0)}</td>
                        <td className={cn('px-3 py-2 text-right', l.quantity > 0 ? 'text-fg' : 'text-warn')}>{l.quantity > 0 ? fmtQty(l.quantity) : 'Too small'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid gap-4 border-t border-line pt-5 md:grid-cols-[1fr_1fr_auto] md:items-start">
              <Field label="Take profit at" hint={`Default 1% of position (${usd(defaultTarget || 0)})`}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={target}
                    onChange={(e) => {
                      setTargetInput(e.target.value);
                      syncBasket({ targetUsdt: Number(e.target.value) || null });
                    }}
                    prefix="+"
                    suffix="USDT"
                  />
                )}
              </Field>
              <Field label="Stop out at" hint={`Default 20% of wallet (${usd(defaultStop || 0)})`}>
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={stop}
                    onChange={(e) => {
                      setStopInput(e.target.value);
                      syncBasket({ stopUsdt: Number(e.target.value) || null });
                    }}
                    prefix="−"
                    suffix="USDT"
                  />
                )}
              </Field>
              <div className="md:pt-6">
                <Switch
                  checked={armed}
                  onChange={(v) => {
                    setArmedInput(v);
                    syncBasket({ armed: v });
                  }}
                  label="Auto-exit"
                />
              </div>
            </div>

            {message && <Callout tone={message.tone}>{message.text}</Callout>}

            <Button
              size="lg"
              block
              variant={side === 'BUY' ? 'buy' : 'sell'}
              loading={submitting}
              disabled={!ready || !config.trading.enabled}
              onClick={open}
            >
              {side === 'BUY' ? 'Long' : 'Short'} {selected.length || ''} coin{selected.length === 1 ? '' : 's'} at {lev}x
            </Button>
            {!ready && selected.length > 0 && (
              <p className="-mt-3 text-center text-xs text-fg-subtle">Pick at least {bulk.minCoins} coins.</p>
            )}
          </div>
        </Card>
      </div>

      <Card className="self-start lg:col-span-2 2xl:sticky 2xl:top-[4.5rem] 2xl:col-span-1">
        <CardHeader
          title="Live basket"
          description="Only positions opened here are tracked. Positions opened on Binance are ignored."
          actions={
            hasBasket ? (
              watcherLive ? <Badge tone="pos" dot>Server watching</Badge> : <Badge tone="warn" dot>Browser only</Badge>
            ) : null
          }
        />
        {hasBasket ? (
          <div className="space-y-4 p-4">
            <div>
              <p className="text-xs text-fg-muted">Combined PnL</p>
              <p className={cn('num mt-1 text-2xl font-semibold tracking-tight', TONE_TEXT[toneOf(basketPnl)])}>{signedUsd(basketPnl)}</p>
              <p className="num mt-1 text-xs text-fg-subtle">
                {armed ? (
                  <>Exits at {Number(target) > 0 ? `+${usd(target)}` : 'no target'} or {Number(stop) > 0 ? `−${usd(stop)}` : 'no stop'}</>
                ) : (
                  'Auto-exit is off'
                )}
              </p>
            </div>
            <ul className="divide-y divide-line rounded-md border border-line">
              {basketPositions.map((p) => (
                <li key={p.symbol} className="num flex items-center justify-between px-3 py-2 text-[13px]">
                  <span className="flex items-center gap-2">
                    <span className={cn('h-4 w-0.5 rounded-full', p.side === 'LONG' ? 'bg-pos' : 'bg-neg')} />
                    <span className="font-medium text-fg">{p.symbol.replace(/USDT$/, '')}</span>
                  </span>
                  <span className={TONE_TEXT[toneOf(p.unrealizedProfit)]}>{signedUsd(p.unrealizedProfit)}</span>
                </li>
              ))}
            </ul>
            {!watcherLive && (
              <Callout tone="warn">The server watcher is not tracking this basket, so auto-exit only works while this tab is open.</Callout>
            )}
            <Button
              block
              variant="danger-soft"
              loading={closing}
              onClick={() => {
                firedRef.current = true;
                closeBasket('Basket closed manually');
              }}
            >
              Exit all {basketPositions.length} now
            </Button>
          </div>
        ) : (
          <EmptyState icon={IconLayers} title="No basket open" description="Open a basket to track its combined PnL here." />
        )}
      </Card>
    </div>
  );
}
