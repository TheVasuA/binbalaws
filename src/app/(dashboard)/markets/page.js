'use client';

import { useState } from 'react';
import Link from 'next/link';
import { US_STOCKS, COMMODITIES } from '@/lib/tradfi';

// Left sub-menu: US Stocks section + each commodity listed separately.
const VIEWS = [
  { id: 'stocks', label: '🇺🇸 US Stocks' },
  { id: 'commodities', label: '🛢 Commodities' },
];

function StockRow({ s }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-700/30 transition-colors">
      <span className="text-white font-medium text-sm">{s.name}</span>
      <span className="text-gray-400 text-xs font-mono bg-gray-900/60 border border-gray-700 rounded px-2 py-0.5">
        {s.symbol}
      </span>
    </div>
  );
}

export default function MarketsPage() {
  const [view, setView] = useState('stocks');

  const totalStocks = US_STOCKS.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 md:py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-white">🌐 TradFi Markets</h1>
        <p className="text-gray-500 text-sm mt-1">US stocks and commodities reference list.</p>
      </div>

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

            {/* Quick jump to each commodity */}
            {view === 'commodities' && (
              <div className="pt-2 mt-1 border-t border-gray-700 space-y-1">
                {COMMODITIES.map((c) => (
                  <a
                    key={c.symbol}
                    href={`#commodity-${c.symbol}`}
                    className="block px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
                  >
                    {c.name}
                  </a>
                ))}
              </div>
            )}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* ── US STOCKS ─────────────────────────────────────────── */}
          {view === 'stocks' && (
            <div className="space-y-4">
              <p className="text-gray-500 text-xs">
                {totalStocks} major US stocks — reference/watchlist only. US stocks are not
                available on Binance, so they can&apos;t be traded here.
              </p>
              {US_STOCKS.map((grp) => (
                <section key={grp.group} className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
                  <div className="px-4 py-2 border-b border-gray-700 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-white">{grp.group}</h2>
                    <span className="text-gray-500 text-xs">{grp.items.length}</span>
                  </div>
                  <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {grp.items.map((s) => <StockRow key={s.symbol} s={s} />)}
                  </div>
                </section>
              ))}
            </div>
          )}

          {/* ── COMMODITIES (each listed separately) ──────────────── */}
          {view === 'commodities' && (
            <div className="space-y-3">
              <p className="text-gray-500 text-xs">
                Only gold is available to trade on Binance (as PAX Gold / Tether Gold).
                Crude, copper, zinc and others are reference-only — Binance has no such market.
              </p>
              {COMMODITIES.map((c) => (
                <section
                  key={c.symbol}
                  id={`commodity-${c.symbol}`}
                  className="scroll-mt-24 bg-gray-800/50 rounded-xl border border-gray-700 p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-white font-semibold">{c.name}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{c.unit} · {c.cat}</p>
                  </div>
                  <div className="text-right flex items-center gap-2 flex-shrink-0">
                    {c.binanceSymbol ? (
                      <>
                        <span className="text-gray-400 text-[11px] font-mono">{c.binanceSymbol}</span>
                        <Link
                          href={`/new-order?symbol=${c.binanceSymbol}`}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors"
                        >
                          Trade
                        </Link>
                      </>
                    ) : (
                      <span className="text-gray-500 text-[11px] px-2 py-1 rounded border border-gray-700 bg-gray-900/60">
                        Not on Binance
                      </span>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="text-center text-gray-500 text-xs md:text-sm py-4 mt-6">
        Reference list only. Connect a market-data API to show live prices.
      </footer>
    </div>
  );
}
