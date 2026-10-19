'use client';

import { useMemo, useState } from 'react';
import { Callout, Input, Segmented, Skeleton } from '@/components/ui';
import { IconSearch } from '@/components/ui/icons';
import { useApi } from '@/lib/use-api';
import { TRADIFI_NAMES } from '@/lib/tradfi';
import { percent } from '@/lib/format';
import { cn } from '@/lib/cn';

const SCAN_REFRESH_MS = 10 * 60_000;

const ASSET_CLASSES = [
  { value: 'crypto', label: 'Crypto' },
  { value: 'stocks', label: 'Stocks' },
  { value: 'commodities', label: 'Commodities' },
];

const CRYPTO_VIEWS = [
  { value: 'threeDay', label: '3-day rank' },
  { value: 'rsiBelow30', label: 'RSI < 30' },
  { value: 'rsiAbove70', label: 'RSI > 70' },
];

const VIEW_HINT = {
  threeDay: 'Ranked by 3-day change, strongest first.',
  rsiBelow30: '1-hour RSI below 30, most oversold first.',
  rsiAbove70: '1-hour RSI above 70, most overbought first.',
  stocks: 'Tokenized US stocks and ETFs, traded as perpetuals.',
  commodities: 'Gold, silver, energy and metals perpetuals.',
};

function matches(item, keyword) {
  return (
    item.symbol.includes(keyword) ||
    item.baseAsset?.includes(keyword) ||
    (TRADIFI_NAMES[item.baseAsset] || '').toUpperCase().includes(keyword)
  );
}

function ChangeText({ value }) {
  if (!Number.isFinite(value)) return <span className="text-fg-subtle">—</span>;
  return <span className={value > 0 ? 'text-pos' : value < 0 ? 'text-neg' : 'text-fg-muted'}>{percent(value, { signed: true })}</span>;
}

/** Symbol picker for the order ticket. Calls `onSelect(symbol)`. */
export function MarketList({ symbols, symbolsLoading, symbolsError, selected, onSelect, className }) {
  const [assetClass, setAssetClass] = useState('crypto');
  const [view, setView] = useState('threeDay');
  const [search, setSearch] = useState('');

  const rsiActive = assetClass === 'crypto' && view !== 'threeDay';
  const shortlist = useApi(assetClass === 'crypto' ? '/api/futures?type=shortlist3d&limit=200' : null, { refreshMs: SCAN_REFRESH_MS });
  const rsiScan = useApi(rsiActive ? '/api/futures?type=rsi1hscan&scanLimit=280' : null, { refreshMs: SCAN_REFRESH_MS });

  const rows = useMemo(() => {
    const keyword = search.trim().toUpperCase();
    if (rsiActive) {
      const source = (view === 'rsiBelow30' ? rsiScan.data?.below30 : rsiScan.data?.above70) || [];
      return (keyword ? source.filter((r) => matches(r, keyword)) : source).map((r) => ({
        symbol: r.symbol,
        baseAsset: r.baseAsset,
        primary: Number.isFinite(r.rsi1h) ? `RSI ${r.rsi1h.toFixed(1)}` : 'RSI —',
        change: r.change24hPercent,
      }));
    }

    const inClass = symbols.filter((s) => {
      if (assetClass === 'stocks') return s.category === 'tradfi';
      if (assetClass === 'commodities') return s.category === 'commodity';
      return !s.category || s.category === 'crypto';
    });
    const filtered = keyword ? inClass.filter((s) => matches(s, keyword)) : inClass;

    const changeBySymbol = new Map((shortlist.data || []).map((r) => [r.symbol, r.change3dPercent]));
    return filtered
      .map((s) => ({
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        name: TRADIFI_NAMES[s.baseAsset] || null,
        change: changeBySymbol.get(s.symbol),
      }))
      .sort((a, b) => {
        if (assetClass !== 'crypto') return a.symbol.localeCompare(b.symbol);
        const av = Number.isFinite(a.change) ? a.change : -Infinity;
        const bv = Number.isFinite(b.change) ? b.change : -Infinity;
        return bv - av || a.symbol.localeCompare(b.symbol);
      });
  }, [assetClass, view, search, symbols, shortlist.data, rsiScan.data, rsiActive]);

  const loading = rsiActive ? rsiScan.loading && !rsiScan.data : symbolsLoading;
  const scanError = rsiActive ? rsiScan.error : assetClass === 'crypto' ? shortlist.error : null;
  const hint = assetClass === 'crypto' ? VIEW_HINT[view] : VIEW_HINT[assetClass];

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="space-y-2.5 border-b border-line p-3">
        <Segmented
          block
          size="xs"
          ariaLabel="Asset class"
          value={assetClass}
          onChange={(v) => {
            setAssetClass(v);
            setSearch('');
          }}
          options={ASSET_CLASSES}
        />
        {assetClass === 'crypto' && (
          <Segmented block size="xs" ariaLabel="Scan" value={view} onChange={setView} options={CRYPTO_VIEWS} />
        )}
        <Input
          size="sm"
          prefix={<IconSearch size={13} />}
          placeholder={assetClass === 'stocks' ? 'Ticker or company' : 'Search symbol'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search markets"
        />
        <p className="text-xs text-fg-subtle">
          {hint}
          {rsiActive && rsiScan.data?.scannedCount ? ` ${rsiScan.data.scannedCount} scanned.` : ''}
        </p>
      </div>

      {(symbolsError || scanError) && (
        <Callout tone="warn" className="m-3">{symbolsError || scanError}</Callout>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label="Markets">
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-7" />)}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-4 text-center text-[13px] text-fg-muted">No markets match.</p>
        ) : (
          rows.map((row, i) => {
            const active = row.symbol === selected;
            return (
              <button
                key={row.symbol}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onSelect(row.symbol)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors',
                  active ? 'bg-accent/10' : 'hover:bg-surface-2',
                )}
              >
                <span className="num w-6 shrink-0 text-xs text-fg-subtle">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate font-medium', active ? 'text-accent' : 'text-fg')}>{row.baseAsset || row.symbol}</span>
                  {row.name && <span className="block truncate text-xs text-fg-subtle">{row.name}</span>}
                </span>
                <span className="num shrink-0 text-right text-xs">
                  {row.primary && <span className="mr-2 text-fg-muted">{row.primary}</span>}
                  <ChangeText value={row.change} />
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
