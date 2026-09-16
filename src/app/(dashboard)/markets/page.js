'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useFetch } from '@/lib/utils';
import { TRADIFI_NAMES, TRADIFI_COMMODITY_NAMES } from '@/lib/tradfi';

// Left sub-menu.
const VIEWS = [
  { id: 'stocks', label: '🇺🇸 US Stocks & TradFi' },
  { id: 'commodities', label: '🛢 Commodities' },
];

// Group tokenized stocks/ETFs into readable buckets by base-asset ticker.
const STOCK_GROUPS = [
  { group: 'Mega-cap Tech', bases: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'AVGO', 'ORCL', 'CRM', 'AMD', 'ADBE', 'INTC', 'QCOM', 'MU', 'TXN', 'CSCO', 'IBM', 'DELL', 'PLTR', 'SMCI', 'ARM', 'ASML', 'TSM'] },
  { group: 'Software / Internet', bases: ['CRWD', 'PANW', 'SNOW', 'NET', 'DDOG', 'SHOP', 'UBER', 'ZM', 'TEAM', 'MDB', 'GTLB', 'ZS', 'NOW', 'APP', 'RDDT', 'DKNG'] },
  { group: 'Crypto / Fintech', bases: ['COIN', 'MSTR', 'HOOD', 'CRCL', 'MARA', 'IREN', 'BMNR', 'NBIS', 'SOFI', 'PYPL', 'PAYP', 'V', 'JPM', 'GS'] },
  { group: 'Consumer / Auto / Other', bases: ['TSLA', 'WMT', 'COST', 'HD', 'KO', 'DIS', 'CAT', 'GME', 'RIVN', 'HIMS', 'WEN', 'EBAY', 'GPRO', 'TTWO', 'DJT'] },
  { group: 'Healthcare / Pharma', bases: ['LLY', 'MRK', 'MRNA', 'NVO'] },
  { group: 'AI Labs / Robotics', bases: ['OPENAI', 'ANTHROPIC', 'ZHIPU', 'MINIMAX', 'UNITREE', 'IONQ'] },
  { group: 'China / Asia', bases: ['BABA', 'PDD', 'TENCENT', 'MEITUAN', 'BYD', 'SONY', 'SAMSUNG', 'HYUNDAI', 'NAVER', 'KUAISHOU', 'POPMART', 'KODEX200'] },
  { group: 'ETFs / Indices / Leveraged', bases: ['SPY', 'QQQ', 'IWM', 'TQQQ', 'SQQQ', 'SOXL', 'SOXS', 'SMH', 'GDX', 'XLE', 'XBI', 'URNM', 'UVXY', 'TSLL', 'NVDL', 'MVLL', 'BITO'] },
];

function TradeRow({ base, symbol, name }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-700/30 transition-colors gap-2">
      <div className="min-w-0">
        <span className="text-white font-medium text-sm">{name}</span>
        <span className="text-gray-500 text-xs ml-2 font-mono">{base}</span>
      </div>
      <Link
        href={`/new-order?symbol=${symbol}`}
        className="flex-shrink-0 px-3 py-1 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors"
      >
        Trade
      </Link>
    </div>
  );
}

export default function MarketsPage() {
  const [view, setView] = useState('stocks');
  const { data: symbolsData, loading, error } = useFetch('/api/futures?type=symbols');

  // All tradable tokenized stocks/ETFs from the exchange, keyed by base asset.
  const stockByBase = useMemo(() => {
    const map = new Map();
    (symbolsData || [])
      .filter((s) => s.category === 'tradfi')
      .forEach((s) => map.set(s.baseAsset, s.symbol));
    return map;
  }, [symbolsData]);

  // Build grouped stock sections from live data. Anything not in a named group
  // lands in "Other".
  const stockSections = useMemo(() => {
    const used = new Set();
    const sections = STOCK_GROUPS.map((g) => {
      const items = g.bases
        .filter((b) => stockByBase.has(b))
        .map((b) => {
          used.add(b);
          return { base: b, symbol: stockByBase.get(b), name: TRADIFI_NAMES[b] || b };
        });
      return { group: g.group, items };
    }).filter((s) => s.items.length > 0);

    const others = [...stockByBase.keys()]
      .filter((b) => !used.has(b))
      .sort()
      .map((b) => ({ base: b, symbol: stockByBase.get(b), name: TRADIFI_NAMES[b] || b }));

    if (others.length > 0) sections.push({ group: 'Other', items: others });
    return sections;
  }, [stockByBase]);

  const totalStocks = stockByBase.size;

  // Commodities from live data.
  const commodities = useMemo(() => {
    return (symbolsData || [])
      .filter((s) => s.category === 'commodity')
      .map((s) => ({
        base: s.baseAsset,
        symbol: s.symbol,
        name: TRADIFI_COMMODITY_NAMES[s.baseAsset] || s.baseAsset,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [symbolsData]);

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 md:py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-white">🌐 TradFi Markets</h1>
        <p className="text-gray-500 text-sm mt-1">
          Tokenized US stocks, ETFs and commodities — all tradable on Binance futures.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400 text-sm">
          Error loading symbols: {error}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left side sub-menu */}
        <aside className="md:w-56 md:flex-shrink-0">
          <nav className="md:sticky md:top-24 bg-gray-800/40 rounded-xl border border-gray-700 p-2 space-y-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  view === v.id ? 'bg-blue-600 text-white font-medium' : 'text-gray-300 hover:text-white hover:bg-gray-700/60'
                }`}
              >
                {v.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {loading && !symbolsData ? (
            <div className="flex justify-center py-16">
              <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* ── US STOCKS & TRADFI ────────────────────────────── */}
              {view === 'stocks' && (
                <div className="space-y-4">
                  <p className="text-gray-500 text-xs">
                    {totalStocks} tokenized stocks &amp; ETFs live on Binance futures. They trade
                    as perpetual contracts — hit Trade to size an order like any crypto pair.
                    Note: TradFi markets follow their own session hours; orders outside those
                    hours may be rejected by the exchange.
                  </p>
                  {stockSections.map((grp) => (
                    <section key={grp.group} className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
                      <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-white">{grp.group}</h2>
                        <span className="text-gray-500 text-xs">{grp.items.length}</span>
                      </div>
                      <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {grp.items.map((s) => (
                          <TradeRow key={s.symbol} base={s.base} symbol={s.symbol} name={s.name} />
                        ))}
                      </div>
                    </section>
                  ))}
                  {stockSections.length === 0 && (
                    <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-10 text-center text-gray-500">
                      No TradFi stock symbols returned by the exchange.
                    </div>
                  )}
                </div>
              )}

              {/* ── COMMODITIES ───────────────────────────────────── */}
              {view === 'commodities' && (
                <div className="space-y-3">
                  <p className="text-gray-500 text-xs">
                    {commodities.length} commodities live on Binance futures (gold, silver,
                    crude, natural gas, copper and more). Hit Trade to open an order.
                  </p>
                  {commodities.map((c) => (
                    <section
                      key={c.symbol}
                      className="bg-gray-800/50 rounded-xl border border-gray-700 p-4 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-white font-semibold">{c.name}</p>
                        <p className="text-gray-500 text-xs mt-0.5 font-mono">{c.base}</p>
                      </div>
                      <div className="text-right flex items-center gap-2 flex-shrink-0">
                        <span className="text-gray-400 text-[11px] font-mono">{c.symbol}</span>
                        <Link
                          href={`/new-order?symbol=${c.symbol}`}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors"
                        >
                          Trade
                        </Link>
                      </div>
                    </section>
                  ))}
                  {commodities.length === 0 && (
                    <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-10 text-center text-gray-500">
                      No commodity symbols returned by the exchange.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <footer className="text-center text-gray-500 text-xs md:text-sm py-4 mt-6">
        Symbols loaded live from Binance futures exchange info.
      </footer>
    </div>
  );
}
