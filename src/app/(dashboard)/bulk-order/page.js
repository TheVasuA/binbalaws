'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFetch, formatCurrency } from '@/lib/utils';

// Lightweight TradingView advanced-chart embed (same approach as New Order).
function TradingViewChart({ symbol, interval }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: `BINANCE:${symbol}.P`,
      width: '100%',
      height: '100%',
      interval,
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      allow_symbol_change: false,
      hide_top_toolbar: false,
      hide_legend: false,
      withdateranges: true,
      save_image: false,
      hide_volume: true,
      support_host: 'https://www.tradingview.com',
      // Hide the chart grid lines (make them transparent).
      overrides: {
        'paneProperties.vertGridProperties.color': 'rgba(0,0,0,0)',
        'paneProperties.horzGridProperties.color': 'rgba(0,0,0,0)',
      },
    });
    containerRef.current.appendChild(script);
  }, [symbol, interval]);

  return <div ref={containerRef} className="h-full w-full" />;
}

// Chart timeframe buttons. `value` maps to TradingView's interval codes.
const CHART_TIMEFRAMES = [
  { label: '1m', value: '1' },
  { label: '5m', value: '5' },
  { label: '15m', value: '15' },
  { label: '1hr', value: '60' },
  { label: '4hr', value: '240' },
  { label: '1d', value: 'D' },
  { label: '1w', value: 'W' },
];

const DEFAULT_LEVERAGE = 10;
const MIN_COINS = 3;
const MAX_COINS = 5;
// Recently-used coins are remembered for 1 day so repeat baskets are one tap.
const RECENT_COINS_KEY = 'bulkScalpRecentCoins';
const RECENT_COINS_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

// Favorite coins — a user-curated starred list, kept for 1 day (re-starring a
// coin refreshes its timer). Shown in the right-side menu. Stored as
// { symbol, favedAt } and pruned to the last 24h on load/save. The `favorites`
// state itself is a plain array of symbols for easy lookup.
const FAVORITES_KEY = 'bulkScalpFavorites';
const FAVORITES_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

// Read the raw { symbol, favedAt } entries, dropping expired ones.
function loadFavoriteEntries() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) || '[]');
    const now = Date.now();
    return (Array.isArray(raw) ? raw : [])
      // Back-compat: old format was a bare string array with no timestamp.
      .map((e) => (typeof e === 'string' ? { symbol: e, favedAt: now } : e))
      .filter((e) => e && typeof e.symbol === 'string' && now - Number(e.favedAt) < FAVORITES_TTL_MS)
      .sort((a, b) => Number(b.favedAt) - Number(a.favedAt));
  } catch {
    return [];
  }
}

// Load favorites as a plain symbol array (pruned to the last 24h).
function loadFavorites() {
  return loadFavoriteEntries().map((e) => e.symbol);
}

// Persist a symbol array, stamping each with the current time and pruning
// expired entries. Returns the surviving symbol array.
function saveFavorites(symbols) {
  if (typeof window === 'undefined') return symbols || [];
  const now = Date.now();
  // Keep prior timestamps for symbols that stay favorited; new ones get `now`.
  const priorTs = new Map(loadFavoriteEntries().map((e) => [e.symbol, Number(e.favedAt)]));
  const entries = (symbols || [])
    .map((symbol) => ({ symbol, favedAt: priorTs.get(symbol) ?? now }))
    .filter((e) => now - e.favedAt < FAVORITES_TTL_MS);
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(entries));
  } catch { /* ignore quota errors */ }
  return entries.map((e) => e.symbol);
}

// Positions THIS APP opened via a bulk order. Auto-exit only ever touches these
// symbols — positions you opened directly on Binance are ignored, even if the
// symbol matches one you selected here. Persisted so a refresh keeps managing
// the same basket. Keyed by symbol → { side, openedAt }.
const APP_OPENED_KEY = 'bulkScalpAppOpened';

function loadAppOpened() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(APP_OPENED_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function saveAppOpened(map) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(APP_OPENED_KEY, JSON.stringify(map || {}));
  } catch { /* ignore quota errors */ }
}

// Load recent coins from localStorage, dropping anything older than the TTL.
function loadRecentCoins() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_COINS_KEY) || '[]');
    const now = Date.now();
    return (Array.isArray(raw) ? raw : [])
      .filter((e) => e && typeof e.symbol === 'string' && now - Number(e.usedAt) < RECENT_COINS_TTL_MS)
      .sort((a, b) => Number(b.usedAt) - Number(a.usedAt));
  } catch {
    return [];
  }
}

// Merge freshly-used symbols into the recent list with the current timestamp,
// prune expired entries, and persist. Returns the updated list.
function recordRecentCoins(symbolsUsed) {
  if (typeof window === 'undefined') return [];
  const now = Date.now();
  const bySymbol = new Map();
  // Keep existing (non-expired) first, then overwrite timestamps for the new ones.
  for (const e of loadRecentCoins()) bySymbol.set(e.symbol, Number(e.usedAt));
  for (const sym of symbolsUsed) bySymbol.set(sym, now);

  const merged = Array.from(bySymbol.entries())
    .filter(([, usedAt]) => now - usedAt < RECENT_COINS_TTL_MS)
    .map(([symbol, usedAt]) => ({ symbol, usedAt }))
    .sort((a, b) => b.usedAt - a.usedAt)
    .slice(0, 20);

  try {
    window.localStorage.setItem(RECENT_COINS_KEY, JSON.stringify(merged));
  } catch { /* ignore quota errors */ }
  return merged;
}
const BALANCE_REFRESH_MS = 5 * 1000;
// Poll the live positions snapshot fast while a bulk scalp is armed so the
// auto-exit reacts quickly. Server caches this for 3s so it stays rate-safe.
const POSITIONS_REFRESH_MS = 3 * 1000;

// Round a raw quantity down to the symbol's step size / precision so Binance
// accepts the market order.
function normalizeOrderQuantity(rawQty, symbolInfo) {
  let quantity = Number(rawQty);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;

  const stepSize = Number(symbolInfo?.stepSize);
  if (Number.isFinite(stepSize) && stepSize > 0) {
    quantity = Math.floor(quantity / stepSize) * stepSize;
  }

  const quantityPrecision = symbolInfo?.quantityPrecision ?? 3;
  return Number(quantity.toFixed(quantityPrecision));
}

export default function BulkOrderPage() {
  // Coin selection: an ordered list of up to MAX_COINS symbols.
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const [side, setSide] = useState('BUY'); // whole basket is long or short
  const [leverage, setLeverage] = useState(DEFAULT_LEVERAGE);
  // Chart shown at the top of the middle column. Hidden until a coin is tapped;
  // chartSymbol stays null until the first click.
  const [chartSymbol, setChartSymbol] = useState(null);
  const [chartInterval, setChartInterval] = useState('60'); // default 1hr
  const [chartVisible, setChartVisible] = useState(false);  // show/hide toggle (starts hidden)
  const [usdtPerCoin, setUsdtPerCoin] = useState('20'); // margin per coin
  // Default total position size = 30k until the user changes sizing manually.
  const [sizeEdited, setSizeEdited] = useState(false);

  // Auto-exit thresholds (aggregate, in USDT). When the summed unrealized PnL
  // of the open basket reaches +target or -stop, every leg is closed at once.
  // Defaults auto-compute (target = 1% of total position, stop = 20% of wallet
  // balance) until the user edits a field — then their value sticks.
  const [targetUsdt, setTargetUsdt] = useState('');
  const [stopUsdt, setStopUsdt] = useState('');
  const [isTargetEdited, setIsTargetEdited] = useState(false);
  const [isStopEdited, setIsStopEdited] = useState(false);
  const [autoExitArmed, setAutoExitArmed] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState(null); // { type, text }
  const [recentCoins, setRecentCoins] = useState([]); // [{ symbol, usedAt }]
  const [favorites, setFavorites] = useState([]); // [symbol]
  // Symbols this app opened via bulk order: { [symbol]: { side, openedAt } }.
  const [appOpened, setAppOpened] = useState({});
  // Id of the server-side basket registered for the last bulk order.
  const [activeBasketId, setActiveBasketId] = useState(null);
  const autoExitFiredRef = useRef(false);

  // Load recent-coin history + favorites + app-opened basket on mount.
  useEffect(() => {
    setRecentCoins(loadRecentCoins());
    setFavorites(loadFavorites());
    setAppOpened(loadAppOpened());
  }, []);

  const {
    data: symbolsData,
    loading: symbolsLoading,
    refetch: refetchSymbols,
  } = useFetch('/api/futures?type=symbols');

  const {
    data: accountData,
    refetch: refetchAccount,
  } = useFetch('/api/futures?type=account', { refreshInterval: BALANCE_REFRESH_MS });

  const {
    data: snapshot,
    refetch: refetchSnapshot,
  } = useFetch('/api/futures?type=positions', { refreshInterval: POSITIONS_REFRESH_MS });

  // Active server-side baskets (managed by the VPS watcher). Lets the UI show
  // whether the watcher is armed and handling the current basket.
  const {
    data: serverBaskets,
  } = useFetch('/api/futures?type=baskets', { refreshInterval: POSITIONS_REFRESH_MS });

  // Today's top gainers (high-volume USDT perps) — used to order the coin list.
  const { data: topGainers } = useFetch(
    '/api/futures?type=topgainers&limit=200&minVol=200000000',
    { refreshInterval: 60 * 1000 },
  );

  const symbols = useMemo(() => symbolsData || [], [symbolsData]);

  // Live prices for the selected coins (for order sizing).
  const priceQuery = selected.length > 0 ? selected.join(',') : 'BTCUSDT';
  const { data: priceData } = useFetch(
    `/api/prices?symbols=${priceQuery}`,
    { refreshInterval: 15 * 1000 },
  );

  const availableBalance = Number(accountData?.availableBalance || 0);
  const walletBalance = Number(accountData?.totalWalletBalance || 0);

  const symbolInfoMap = useMemo(() => {
    const map = new Map();
    symbols.forEach((s) => map.set(s.symbol, s));
    return map;
  }, [symbols]);

  // Map symbol → { rank, change24hPercent } from today's top-gainers list.
  const gainerInfo = useMemo(() => {
    const map = new Map();
    (topGainers || []).forEach((g, i) => {
      map.set(g.symbol, { rank: i, change24hPercent: g.change24hPercent });
    });
    return map;
  }, [topGainers]);

  const filteredSymbols = useMemo(() => {
    // Bulk scalp trades USDT-quoted perpetuals only — drop USDC and others.
    const usdtOnly = symbols.filter((s) => s.quoteAsset === 'USDT');
    const keyword = search.trim().toUpperCase();

    // When searching, show ALL matching USDT symbols (still gainer-sorted) so
    // any coin is findable — even ones below the volume floor.
    if (keyword) {
      const matches = usdtOnly.filter(
        (s) => s.symbol.includes(keyword) || s.baseAsset.includes(keyword),
      );
      return matches
        .sort((a, b) => {
          const ra = gainerInfo.get(a.symbol)?.rank ?? Infinity;
          const rb = gainerInfo.get(b.symbol)?.rank ?? Infinity;
          if (ra !== rb) return ra - rb;
          return a.symbol.localeCompare(b.symbol);
        })
        .slice(0, 80);
    }

    // No search: show ONLY today's high-volume top gainers, in rank order.
    // (Avoids a wall of alphabetical A-coins when few coins meet the floor.)
    const ranked = usdtOnly
      .filter((s) => gainerInfo.has(s.symbol))
      .sort((a, b) => gainerInfo.get(a.symbol).rank - gainerInfo.get(b.symbol).rank);

    return ranked;
  }, [symbols, search, gainerInfo]);

  const toggleCoin = (sym) => {
    setMessage(null);
    // Always show the tapped coin's chart, even when deselecting.
    setChartSymbol(sym);
    setChartVisible(true);
    setSelected((prev) => {
      if (prev.includes(sym)) return prev.filter((s) => s !== sym);
      if (prev.length >= MAX_COINS) return prev;
      return [...prev, sym];
    });
  };

  // Quick-select a total position size (notional). Back-calculates the margin
  // per coin so that margin × leverage × coins == target notional.
  const applyTotalNotional = (targetNotional) => {
    const lev = Number(leverage);
    const coins = selected.length;
    if (!Number.isFinite(lev) || lev <= 0 || coins <= 0) {
      setMessage({ type: 'error', text: 'Select coins and set leverage first.' });
      return;
    }
    const perCoin = targetNotional / (lev * coins);
    setUsdtPerCoin(perCoin.toFixed(2));
    // A preset keeps sizing "auto" so the default 30k tracking stays active
    // only when it IS 30k; other presets mark it as a manual choice.
    setSizeEdited(targetNotional !== 30000);
  };

  // Star / unstar a coin. Favorites are kept for 1 day; re-starring refreshes
  // the timer. saveFavorites prunes expired entries and returns the survivors.
  const toggleFavorite = (sym) => {
    setFavorites((prev) => {
      const next = prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym];
      return saveFavorites(next);
    });
  };

  // The basket = live positions that THIS APP opened (tracked in appOpened).
  // A position opened directly on Binance is never included, even if its
  // symbol matches a selected coin — the side must also match what we opened.
  const basketPositions = useMemo(() => {
    const positions = snapshot?.positions || [];
    return positions.filter((p) => {
      const record = appOpened[p.symbol];
      return record && record.side === p.side;
    });
  }, [snapshot, appOpened]);

  // Symbols the snapshot has loaded — used to detect positions that closed so
  // we can drop them from the app-opened set (stops re-managing a closed coin).
  const openSymbolKey = useMemo(
    () => (snapshot?.positions || []).map((p) => `${p.symbol}:${p.side}`).sort().join('|'),
    [snapshot],
  );

  // Prune app-opened entries whose position is no longer open on the exchange.
  useEffect(() => {
    if (!snapshot?.positions) return; // wait for a real snapshot before pruning
    const live = new Set((snapshot.positions || []).map((p) => `${p.symbol}:${p.side}`));
    setAppOpened((prev) => {
      const next = {};
      let changed = false;
      for (const [sym, rec] of Object.entries(prev)) {
        if (live.has(`${sym}:${rec.side}`)) next[sym] = rec;
        else changed = true;
      }
      if (changed) saveAppOpened(next);
      return changed ? next : prev;
    });
    // openSymbolKey captures the meaningful change in the positions list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSymbolKey]);

  const basketPnl = useMemo(
    () => basketPositions.reduce((sum, p) => sum + Number(p.unrealizedProfit || 0), 0),
    [basketPositions],
  );

  const hasOpenBasket = basketPositions.length > 0;

  // Per-coin sizing preview.
  const legPreviews = useMemo(() => {
    const margin = Number(usdtPerCoin);
    const lev = Number(leverage);
    return selected.map((sym) => {
      const info = symbolInfoMap.get(sym);
      const price = Number(priceData?.[sym]?.price || 0);
      const notional = Number.isFinite(margin) && Number.isFinite(lev) ? margin * lev : 0;
      const rawQty = price > 0 ? notional / price : 0;
      const qty = normalizeOrderQuantity(rawQty, info);
      return { symbol: sym, price, notional, quantity: qty, info };
    });
  }, [selected, usdtPerCoin, leverage, priceData, symbolInfoMap]);

  const totalMargin = useMemo(() => {
    const margin = Number(usdtPerCoin);
    if (!Number.isFinite(margin)) return 0;
    return margin * selected.length;
  }, [usdtPerCoin, selected.length]);

  // Total position value = margin × leverage across all selected coins.
  const totalNotional = useMemo(() => {
    const lev = Number(leverage);
    if (!Number.isFinite(lev) || lev <= 0) return 0;
    return totalMargin * lev;
  }, [totalMargin, leverage]);

  // Default the total position size to 30k once coins are selected, until the
  // user changes sizing manually (via input/slider or a different preset).
  useEffect(() => {
    if (sizeEdited) return;
    const coins = selected.length;
    const lev = Number(leverage);
    if (coins <= 0 || !Number.isFinite(lev) || lev <= 0) return;
    const perCoin = (30000 / (lev * coins)).toFixed(2);
    setUsdtPerCoin((prev) => (prev === perCoin ? prev : perCoin));
  }, [selected.length, leverage, sizeEdited]);

  // Default auto-exit values: take-profit = 1% of total position value,
  // stop-loss = 20% of wallet balance.
  const defaultTargetUsdt = useMemo(
    () => (totalNotional > 0 ? totalNotional * 0.01 : null),
    [totalNotional],
  );
  const defaultStopUsdt = useMemo(
    () => (walletBalance > 0 ? walletBalance * 0.20 : null),
    [walletBalance],
  );

  // Keep the target field on its default (1% of position) until edited.
  useEffect(() => {
    if (isTargetEdited) return;
    if (!Number.isFinite(defaultTargetUsdt) || defaultTargetUsdt <= 0) return;
    setTargetUsdt(defaultTargetUsdt.toFixed(2));
  }, [defaultTargetUsdt, isTargetEdited]);

  // Keep the stop field on its default (20% of wallet) until edited.
  useEffect(() => {
    if (isStopEdited) return;
    if (!Number.isFinite(defaultStopUsdt) || defaultStopUsdt <= 0) return;
    setStopUsdt(defaultStopUsdt.toFixed(2));
  }, [defaultStopUsdt, isStopEdited]);

  // ── Close the whole basket in one shot ──────────────────────────────────
  // Only closes the symbols THIS APP opened — never a Binance-opened position.
  const closeBasket = useCallback(async (reason) => {
    const appSymbols = basketPositions.map((p) => p.symbol);
    if (appSymbols.length === 0) {
      setMessage({ type: 'error', text: 'No app-opened positions to close.' });
      return;
    }
    setClosing(true);
    try {
      const response = await fetch('/api/futures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulkClose', symbols: appSymbols, basketId: activeBasketId }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to close basket');
      }
      // Drop the closed symbols from the app-opened set immediately.
      setAppOpened((prev) => {
        const next = { ...prev };
        for (const sym of appSymbols) delete next[sym];
        saveAppOpened(next);
        return next;
      });
      const closed = result.data?.closed ?? 0;
      setMessage({
        type: 'success',
        text: `${reason ? reason + ' — ' : ''}Closed ${closed} position${closed === 1 ? '' : 's'} in one shot.`,
      });
      refetchSnapshot();
      refetchAccount();
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setClosing(false);
    }
  }, [basketPositions, activeBasketId, refetchSnapshot, refetchAccount]);

  // ── Auto-exit watcher ───────────────────────────────────────────────────
  // When a basket is open and armed, close everything once aggregate PnL
  // reaches +target or -stop. autoExitFiredRef prevents duplicate fires.
  useEffect(() => {
    if (!autoExitArmed || !hasOpenBasket || closing) return;
    if (autoExitFiredRef.current) return;

    const target = Number(targetUsdt);
    const stop = Number(stopUsdt);
    const hitTarget = Number.isFinite(target) && target > 0 && basketPnl >= target;
    const hitStop = Number.isFinite(stop) && stop > 0 && basketPnl <= -stop;

    if (hitTarget || hitStop) {
      autoExitFiredRef.current = true;
      closeBasket(hitTarget ? `Target +${formatCurrency(basketPnl)} reached` : `Stop ${formatCurrency(basketPnl)} hit`);
    }
  }, [autoExitArmed, hasOpenBasket, closing, basketPnl, targetUsdt, stopUsdt, closeBasket]);

  // Re-arm the auto-exit trigger whenever a new basket opens (goes from empty
  // to holding positions). Also forget the server basket id once flat.
  useEffect(() => {
    if (!hasOpenBasket) {
      autoExitFiredRef.current = false;
      setActiveBasketId(null);
    }
  }, [hasOpenBasket]);

  // Sync threshold / armed changes to the server-side basket so the VPS
  // watcher always uses the latest values. Debounced so typing doesn't spam.
  useEffect(() => {
    if (!activeBasketId) return;
    const parsedTarget = Number(targetUsdt);
    const parsedStop = Number(stopUsdt);
    const handle = setTimeout(() => {
      fetch('/api/futures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateBasket',
          basketId: activeBasketId,
          targetUsdt: Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : null,
          stopUsdt: Number.isFinite(parsedStop) && parsedStop > 0 ? parsedStop : null,
          armed: autoExitArmed,
        }),
      }).catch(() => { /* best effort */ });
    }, 600);
    return () => clearTimeout(handle);
  }, [activeBasketId, targetUsdt, stopUsdt, autoExitArmed]);

  // ── Fire the bulk entry ─────────────────────────────────────────────────
  const handleBulkOpen = async () => {
    setMessage(null);

    if (selected.length < MIN_COINS) {
      setMessage({ type: 'error', text: `Select at least ${MIN_COINS} coins.` });
      return;
    }
    if (selected.length > MAX_COINS) {
      setMessage({ type: 'error', text: `Select at most ${MAX_COINS} coins.` });
      return;
    }

    const margin = Number(usdtPerCoin);
    if (!Number.isFinite(margin) || margin <= 0) {
      setMessage({ type: 'error', text: 'USDT per coin must be a positive number.' });
      return;
    }

    const legs = [];
    for (const preview of legPreviews) {
      if (!(preview.price > 0)) {
        setMessage({ type: 'error', text: `Live price unavailable for ${preview.symbol}. Retry in a moment.` });
        return;
      }
      if (!(preview.quantity > 0)) {
        setMessage({ type: 'error', text: `Quantity for ${preview.symbol} is too small. Increase USDT per coin.` });
        return;
      }
      const minQty = Number(preview.info?.minQty);
      if (Number.isFinite(minQty) && minQty > 0 && preview.quantity < minQty) {
        setMessage({ type: 'error', text: `${preview.symbol} quantity ${preview.quantity} is below min ${minQty}.` });
        return;
      }
      legs.push({ symbol: preview.symbol, side, quantity: preview.quantity, leverage: Number(leverage) });
    }

    try {
      setSubmitting(true);
      autoExitFiredRef.current = false;
      // Send the auto-exit thresholds so the server-side watcher can manage
      // this basket 24/7, independent of this browser tab.
      const parsedTarget = Number(targetUsdt);
      const parsedStop = Number(stopUsdt);
      const response = await fetch('/api/futures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulkOpen',
          legs,
          targetUsdt: Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : null,
          stopUsdt: Number.isFinite(parsedStop) && parsedStop > 0 ? parsedStop : null,
          armed: autoExitArmed,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to place bulk order');
      }

      // Remember the server-side basket id so closes/updates target it.
      if (result.data?.basket?.id) {
        setActiveBasketId(result.data.basket.id);
      }

      const filled = result.data?.filled ?? 0;
      const failed = result.data?.failed ?? 0;
      const failedList = (result.data?.results || []).filter((r) => !r.ok);

      // Remember the coins that actually filled so repeat baskets are one tap.
      const filledResults = (result.data?.results || []).filter((r) => r.ok);
      const filledSymbols = filledResults.map((r) => r.symbol);
      if (filledSymbols.length > 0) {
        setRecentCoins(recordRecentCoins(filledSymbols));
      }

      // Mark these as app-opened so ONLY they are auto-exited later. The side
      // is stored as LONG/SHORT to match the live position side.
      if (filledResults.length > 0) {
        setAppOpened((prev) => {
          const next = { ...prev };
          const posSide = side === 'BUY' ? 'LONG' : 'SHORT';
          for (const r of filledResults) {
            next[r.symbol] = { side: posSide, openedAt: Date.now() };
          }
          saveAppOpened(next);
          return next;
        });
      }
      setMessage({
        type: failed > 0 ? 'warning' : 'success',
        text: failed > 0
          ? `Filled ${filled}/${legs.length}. Failed: ${failedList.map((r) => `${r.symbol} (${r.error})`).join(', ')}`
          : `Bulk ${side === 'BUY' ? 'long' : 'short'} placed for ${filled} coins in one shot.`,
      });
      refetchSnapshot();
      refetchAccount();
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const pnlColor = basketPnl > 0 ? 'text-green-400' : basketPnl < 0 ? 'text-red-400' : 'text-gray-300';
  // Is the current basket registered with the server-side watcher?
  const serverManaged = useMemo(() => {
    if (!activeBasketId) return false;
    return (serverBaskets || []).some((b) => b.id === activeBasketId);
  }, [serverBaskets, activeBasketId]);
  // Slider max: enough to cover the largest quick-size preset's per-coin margin
  // (60k total ÷ leverage ÷ coins), the available balance, and the current
  // value — so the thumb never clips after applying a big preset.
  const usdtSliderMax = useMemo(() => {
    const coins = Math.max(selected.length, 1);
    const lev = Math.max(Number(leverage) || 1, 1);
    const presetMax = 60000 / lev / coins;
    const balanceMax = availableBalance / coins;
    const current = Number(usdtPerCoin) || 0;
    return Math.max(100, Math.ceil(presetMax), Math.ceil(balanceMax), Math.ceil(current));
  }, [selected.length, leverage, availableBalance, usdtPerCoin]);

  return (
    <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 py-4 md:py-8">
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">⚡ Bulk Scalp</h1>
          <p className="text-sm text-gray-400 mt-1">
            Pick {MIN_COINS}–{MAX_COINS} coins, enter all in one shot at {DEFAULT_LEVERAGE}x, auto-exit the whole basket on aggregate PnL.
          </p>
        </div>
        <button
          onClick={() => { refetchSymbols(); refetchAccount(); refetchSnapshot(); }}
          className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 transition-colors self-start"
        >
          Refresh
        </button>
      </div>

      {message && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
          message.type === 'error'
            ? 'border-red-500/40 bg-red-500/10 text-red-300'
            : message.type === 'warning'
              ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200'
              : 'border-green-500/40 bg-green-500/10 text-green-300'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6 items-stretch lg:h-[calc(100vh-11rem)]">
        {/* ── Coin selection (left) ──────────────────────────────────────── */}
        <section className="lg:col-span-1 bg-gray-800/50 rounded-xl border border-gray-700 p-4 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Select Coins <span className="text-[10px] font-normal text-gray-500">· top gainers</span></h2>
            <span className={`text-xs font-medium ${
              selected.length >= MIN_COINS && selected.length <= MAX_COINS ? 'text-green-400' : 'text-gray-400'
            }`}>
              {selected.length}/{MAX_COINS}
            </span>
          </div>

          {/* Recently used coins — tap to select. Kept for 1 day. */}
          {recentCoins.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] text-yellow-400/80 font-medium mb-1.5">
                🕘 Recently used — tap to select
              </p>
              <div className="flex flex-wrap gap-1.5">
                {recentCoins.map((c) => {
                  const active = selected.includes(c.symbol);
                  const disabled = !active && selected.length >= MAX_COINS;
                  return (
                    <button
                      key={c.symbol}
                      onClick={() => toggleCoin(c.symbol)}
                      title={disabled ? `Max ${MAX_COINS} selected — shows chart only` : `Last used ${new Date(c.usedAt).toLocaleString()}`}
                      className={`px-2 py-1 rounded-md text-xs font-medium border transition-colors ${
                        active
                          ? 'bg-blue-500/20 border-blue-500 text-blue-200'
                          : 'bg-gray-900 border-yellow-600/30 text-yellow-200/90 hover:bg-yellow-500/10'
                      } ${disabled ? 'opacity-50' : ''}`}
                    >
                      {c.symbol}{active ? ' ✓' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search e.g. BTC, SOL"
            className="w-full mb-3 px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />

          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {selected.map((sym) => (
                <button
                  key={sym}
                  onClick={() => toggleCoin(sym)}
                  className="px-2 py-1 rounded-md bg-blue-500/20 border border-blue-500 text-blue-200 text-xs font-medium hover:bg-blue-500/30"
                >
                  {sym} ✕
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 min-h-72 overflow-y-auto rounded-lg border border-gray-700 divide-y divide-gray-800">
            {symbolsLoading && (
              <p className="p-3 text-sm text-gray-500">Loading symbols…</p>
            )}
            {!symbolsLoading && filteredSymbols.length === 0 && (
              <p className="p-3 text-sm text-gray-500">
                {search.trim()
                  ? 'No matching coins.'
                  : 'Loading top gainers… or search for a coin.'}
              </p>
            )}
            {!symbolsLoading && filteredSymbols.map((s) => {
              const active = selected.includes(s.symbol);
              const disabled = !active && selected.length >= MAX_COINS;
              const fav = favorites.includes(s.symbol);
              return (
                <div
                  key={s.symbol}
                  className={`flex items-center transition-colors ${
                    active ? 'bg-blue-500/15' : 'hover:bg-gray-800'
                  }`}
                >
                  <button
                    onClick={() => toggleFavorite(s.symbol)}
                    title={fav ? 'Remove from favorites' : 'Add to favorites'}
                    className={`pl-3 pr-1 py-2 text-sm ${fav ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}
                  >
                    {fav ? '★' : '☆'}
                  </button>
                  <button
                    onClick={() => toggleCoin(s.symbol)}
                    title={disabled ? `Max ${MAX_COINS} selected — shows chart only` : undefined}
                    className={`flex-1 flex items-center justify-between pr-3 py-2 text-sm text-left ${
                      active ? 'text-blue-200' : 'text-gray-300'
                    } ${disabled ? 'opacity-50' : ''}`}
                  >
                    <span className="font-medium">{s.baseAsset}</span>
                    {(() => {
                      const chg = gainerInfo.get(s.symbol)?.change24hPercent;
                      return Number.isFinite(chg) ? (
                        <span className={`text-xs font-semibold tabular-nums ${chg >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {chg >= 0 ? '+' : ''}{chg}%
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">{s.symbol}</span>
                      );
                    })()}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Buy / Sell area (middle) ───────────────────────────────────── */}
        <section className="lg:col-span-2 bg-gray-800/50 rounded-xl border border-gray-700 p-4 flex flex-col overflow-hidden">
          <div className="grid grid-cols-3 items-baseline mb-4">
            <h2 className="text-sm font-semibold text-white">Buy / Sell</h2>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-xs font-medium text-pink-400/70">Balance</span>
              <span className="text-2xl md:text-3xl font-extrabold text-pink-400 tabular-nums">
                {formatCurrency(walletBalance)}
              </span>
            </div>
            <span aria-hidden="true" />
          </div>

          {/* ── Chart of the tapped coin (only after a coin is clicked) ──── */}
          {chartSymbol && chartVisible && (
            <div className="mb-4">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <span className="text-xs text-gray-300">
                  Chart: <span className="text-white font-semibold">{chartSymbol}</span>
                </span>
                <div className="flex items-center gap-1">
                  <div className="flex flex-wrap gap-1">
                    {CHART_TIMEFRAMES.map((tf) => (
                      <button
                        key={tf.value}
                        type="button"
                        onClick={() => setChartInterval(tf.value)}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors ${
                          chartInterval === tf.value
                            ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                            : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'
                        }`}
                      >
                        {tf.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setChartVisible(false)}
                    title="Hide chart"
                    className="ml-1 px-2 py-0.5 rounded-md text-[11px] text-gray-400 border border-gray-700 hover:bg-gray-800"
                  >
                    Hide
                  </button>
                </div>
              </div>
              <div className="h-64 md:h-80 rounded-lg border border-gray-700 overflow-hidden bg-gray-900">
                <TradingViewChart
                  key={`${chartSymbol}-${chartInterval}`}
                  symbol={chartSymbol}
                  interval={chartInterval}
                />
              </div>
            </div>
          )}

          {/* Collapsed chart bar — always available to open the chart, even
              before clicking a coin (defaults to the last symbol or BTCUSDT). */}
          {!chartVisible && (
            <button
              type="button"
              onClick={() => {
                if (!chartSymbol) setChartSymbol('BTCUSDT');
                setChartVisible(true);
              }}
              className="mb-4 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-gray-700 bg-gray-900 text-xs text-gray-300 hover:bg-gray-800 transition-colors"
            >
              📈 Show chart{chartSymbol ? ` (${chartSymbol})` : ''}
            </button>
          )}

          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Side */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Direction (whole basket)</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSide('BUY')}
                className={`py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                  side === 'BUY' ? 'bg-green-500/20 border-green-500 text-green-300' : 'bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800'
                }`}
              >
                Long (Buy)
              </button>
              <button
                onClick={() => setSide('SELL')}
                className={`py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                  side === 'SELL' ? 'bg-red-500/20 border-red-500 text-red-300' : 'bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800'
                }`}
              >
                Short (Sell)
              </button>
            </div>
          </div>

          {/* Leverage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-400">Leverage</label>
              <span className="text-sm font-semibold text-white">{leverage}x</span>
            </div>
            <input
              type="range"
              min="1"
              max="50"
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
            <div className="flex gap-1.5 mt-2">
              {[5, 10, 20, 25].map((lev) => (
                <button
                  key={lev}
                  onClick={() => setLeverage(lev)}
                  className={`px-2.5 py-1 rounded-md text-xs border ${
                    leverage === lev ? 'bg-blue-500/20 border-blue-500 text-blue-300' : 'bg-gray-900 border-gray-700 text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  {lev}x
                </button>
              ))}
            </div>
          </div>

          {/* USDT per coin slider */}
          <div>
            {/* Total position value (margin × leverage) — big yellow above slider */}
            <div className="mb-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-yellow-500/80">Total position ({leverage}x)</span>
                <span className="text-2xl md:text-3xl font-extrabold text-yellow-400 tabular-nums">
                  {formatCurrency(totalNotional)}
                </span>
              </div>
              <div className="flex items-baseline justify-between mt-1 text-xs text-yellow-500/70">
                <span>Margin ({selected.length} coins)</span>
                <span className="font-semibold tabular-nums">{formatCurrency(totalMargin)}</span>
              </div>
            </div>
            {/* Quick total-position-size presets. Tapping one back-solves the
                margin per coin so the total position matches the target. */}
            <div className="mb-3">
              <p className="text-[11px] font-medium text-gray-400 mb-1.5">Quick order size (total position)</p>
              <div className="grid grid-cols-3 gap-1.5">
                {[10000, 20000, 30000, 40000, 50000, 60000].map((size) => {
                  const active = Math.abs(totalNotional - size) < 1;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => applyTotalNotional(size)}
                      disabled={selected.length === 0}
                      className={`py-1.5 rounded-md text-xs font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        active
                          ? 'bg-yellow-500/20 border-yellow-500 text-yellow-300'
                          : 'bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      {size / 1000}k
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-400">Margin per coin (USDT)</label>
              <input
                type="number"
                min="0"
                value={usdtPerCoin}
                onChange={(e) => { setSizeEdited(true); setUsdtPerCoin(e.target.value); }}
                className="w-24 px-2 py-1 rounded-md bg-gray-900 border border-gray-700 text-sm text-right text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <input
              type="range"
              min="1"
              max={usdtSliderMax}
              value={Math.min(Number(usdtPerCoin) || 0, usdtSliderMax)}
              onChange={(e) => { setSizeEdited(true); setUsdtPerCoin(e.target.value); }}
              className="w-full accent-blue-500"
            />
            <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
              <span>Per coin: <span className="text-gray-300 font-medium">{formatCurrency(Number(usdtPerCoin) || 0)}</span></span>
              <span>Avail: {formatCurrency(availableBalance)}</span>
            </div>
          </div>

          {/* Sizing preview */}
          {selected.length > 0 && (
            <div className="rounded-lg border border-gray-700 overflow-hidden">
              <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-gray-900/60 text-[11px] uppercase tracking-wide text-gray-500 font-medium">
                <span>Coin</span>
                <span className="text-right">Price</span>
                <span className="text-right">Notional</span>
                <span className="text-right">Qty</span>
              </div>
              {legPreviews.map((leg) => (
                <div key={leg.symbol} className="grid grid-cols-4 gap-2 px-3 py-2 text-xs text-gray-300 border-t border-gray-800">
                  <span className="font-medium text-white">{leg.symbol}</span>
                  <span className="text-right">{leg.price > 0 ? leg.price : '—'}</span>
                  <span className="text-right">{formatCurrency(leg.notional)}</span>
                  <span className="text-right">{leg.quantity > 0 ? leg.quantity : '⚠︎'}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleBulkOpen}
            disabled={submitting || selected.length < MIN_COINS}
            className={`w-full py-3 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              side === 'BUY' ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
          >
            {submitting
              ? 'Placing…'
              : `Bulk ${side === 'BUY' ? 'BUY' : 'SELL'} ${selected.length} coin${selected.length === 1 ? '' : 's'} @ ${leverage}x`}
          </button>

          {/* ── Auto-exit + live basket tracker (new section) ────────────── */}
          <div className="mt-1 pt-5 border-t border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-white">Auto-Exit &amp; Live Basket</h2>
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoExitArmed}
                  onChange={(e) => setAutoExitArmed(e.target.checked)}
                  className="accent-blue-500 w-4 h-4"
                />
                Auto-exit armed
              </label>
            </div>
            {/* Server-watcher status badge. */}
            <div className="mb-4">
              {serverManaged ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-green-300 bg-green-500/10 border border-green-500/30 rounded-full px-2.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Server watcher managing this basket (24/7)
                </span>
              ) : hasOpenBasket ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-full px-2.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                  Browser-only exit — start the VPS watcher for 24/7 protection
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-400">Take-profit target (USDT)</label>
                  {isTargetEdited && Number.isFinite(defaultTargetUsdt) && (
                    <button
                      type="button"
                      onClick={() => setIsTargetEdited(false)}
                      className="text-[10px] text-green-400/80 hover:text-green-300"
                    >
                      reset 1%
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  value={targetUsdt}
                  onChange={(e) => { setIsTargetEdited(true); setTargetUsdt(e.target.value); }}
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-white focus:outline-none focus:border-green-500"
                  placeholder="e.g. 10"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Default 1% of position ({formatCurrency(defaultTargetUsdt || 0)}). Close all when PnL ≥ +this.
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-400">Stop-loss (USDT)</label>
                  {isStopEdited && Number.isFinite(defaultStopUsdt) && (
                    <button
                      type="button"
                      onClick={() => setIsStopEdited(false)}
                      className="text-[10px] text-red-400/80 hover:text-red-300"
                    >
                      reset 20%
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  value={stopUsdt}
                  onChange={(e) => { setIsStopEdited(true); setStopUsdt(e.target.value); }}
                  className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-white focus:outline-none focus:border-red-500"
                  placeholder="e.g. 10"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Default 20% of wallet ({formatCurrency(defaultStopUsdt || 0)}). Close all when PnL ≤ −this.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Aggregate unrealized PnL ({basketPositions.length} app-opened)</span>
                <span className={`text-lg font-bold ${pnlColor}`}>{formatCurrency(basketPnl)}</span>
              </div>
              <p className="text-[11px] text-gray-500 mb-3">
                Only positions opened from this app are tracked and auto-exited. Positions opened directly on Binance are ignored.
              </p>

              {hasOpenBasket ? (
                <div className="space-y-1.5 mb-4 max-h-48 overflow-y-auto">
                  {basketPositions.map((p) => (
                    <div key={p.symbol} className="flex items-center justify-between text-xs">
                      <span className="text-gray-300 font-medium">
                        {p.symbol} <span className={p.side === 'LONG' ? 'text-green-400' : 'text-red-400'}>{p.side}</span>
                      </span>
                      <span className={Number(p.unrealizedProfit) >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {formatCurrency(Number(p.unrealizedProfit || 0))}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 mb-4">No app-opened positions yet. Place a bulk order to start tracking.</p>
              )}

              <button
                onClick={() => { autoExitFiredRef.current = true; closeBasket('Manual close'); }}
                disabled={closing || !hasOpenBasket}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-gray-700 hover:bg-gray-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {closing ? 'Closing…' : 'Exit all now (one shot)'}
              </button>
            </div>
          </div>
          </div>
        </section>

        {/* ── Favorites (right menu) ─────────────────────────────────────── */}
        <section className="lg:col-span-1 bg-gray-800/50 rounded-xl border border-gray-700 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">⭐ Favorites</h2>
            <span className="text-xs text-gray-500">{favorites.length}</span>
          </div>

          {favorites.length === 0 ? (
            <p className="text-xs text-gray-500 flex-1">
              Star a coin in the list (☆) to save it here for 1 day. Tap a favorite to add it to your basket.
            </p>
          ) : (
            <div className="space-y-1.5 flex-1 overflow-y-auto">
              {favorites.map((sym) => {
                const info = symbolInfoMap.get(sym);
                const active = selected.includes(sym);
                const disabled = !active && selected.length >= MAX_COINS;
                return (
                  <div
                    key={sym}
                    className={`flex items-center rounded-lg border transition-colors ${
                      active ? 'bg-blue-500/15 border-blue-500' : 'bg-gray-900 border-gray-700 hover:bg-gray-800'
                    }`}
                  >
                    <button
                      onClick={() => toggleCoin(sym)}
                      title={disabled ? `Max ${MAX_COINS} selected — shows chart only` : undefined}
                      className={`flex-1 flex items-center justify-between px-3 py-2 text-sm text-left ${
                        active ? 'text-blue-200' : 'text-gray-300'
                      } ${disabled ? 'opacity-50' : ''}`}
                    >
                      <span className="font-medium">{info?.baseAsset || sym}</span>
                      <span className="text-xs text-gray-500">{active ? '✓' : sym}</span>
                    </button>
                    <button
                      onClick={() => toggleFavorite(sym)}
                      title="Remove from favorites"
                      className="pr-3 pl-1 py-2 text-yellow-400 hover:text-yellow-300"
                    >
                      ★
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
