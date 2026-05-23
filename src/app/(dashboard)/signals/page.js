'use client';

import { useState, useEffect } from 'react';

export default function SignalsPage() {
  const [highConfEntries, setHighConfEntries] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadScans = async () => {
    if (scanning) return;
    setScanning(true);
    setScanError(null);
    try {
      const resp = await fetch('/api/futures?type=rsi1hscan');
      const json = await resp.json();
      if (json.success && json.data) {
        const data = json.data;
        const entries = [];
        // Build entry signals from RSI scan data
        for (const item of (data.below30 || [])) {
          entries.push({
            symbol: item.symbol,
            baseAsset: item.baseAsset,
            rsi1h: item.rsi1h,
            change3dPercent: item.change3dPercent || 0,
            lastPrice: item.lastPrice,
            signal: 'LONG',
            confidence: Math.min(100, Math.round((30 - item.rsi1h) * 3 + Math.abs(item.change3dPercent || 0) * 2)),
            change24hPercent: item.change24hPercent,
            quoteVolume: item.quoteVolume,
          });
        }
        for (const item of (data.above70 || [])) {
          entries.push({
            symbol: item.symbol,
            baseAsset: item.baseAsset,
            rsi1h: item.rsi1h,
            change3dPercent: item.change3dPercent || 0,
            lastPrice: item.lastPrice,
            signal: 'SHORT',
            confidence: Math.min(100, Math.round((item.rsi1h - 70) * 3 + Math.abs(item.change3dPercent || 0) * 2)),
            change24hPercent: item.change24hPercent,
            quoteVolume: item.quoteVolume,
          });
        }
        setHighConfEntries(
          entries.sort((a, b) => b.confidence - a.confidence).slice(0, 50)
        );
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (err) {
      setScanError(err.message);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    loadScans();
    const id = setInterval(loadScans, 3 * 60 * 1000); // Refresh every 3 min
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-full xl:max-w-screen-2xl mx-auto px-2 sm:px-6 lg:px-12 py-4 md:py-8 flex flex-col">
      {/* ═══ Header ═══════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            📊 Entry Signals
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            RSI (1h) + 3-Day Momentum scan · {highConfEntries.length} signals found
            {lastUpdated && <span className="text-gray-500 ml-2">· Updated {lastUpdated}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-green-500/30 border border-green-500/50" />
              <span className="text-gray-400">Long</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-red-500/30 border border-red-500/50" />
              <span className="text-gray-400">Short</span>
            </span>
          </div>
          <button
            onClick={loadScans}
            disabled={scanning}
            className="px-4 py-2 text-sm bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 rounded-lg transition-colors disabled:opacity-50 font-medium"
          >
            {scanning ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Scanning...
              </span>
            ) : (
              '↻ Refresh'
            )}
          </button>
        </div>
      </div>

      {/* ═══ Filter / Stats Bar ════════════════════════════════════════ */}
      {highConfEntries.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="px-3 py-1.5 bg-gray-800 rounded-lg text-xs text-gray-300 border border-gray-700">
            Longs: <span className="text-green-400 font-semibold">{highConfEntries.filter(e => e.signal === 'LONG').length}</span>
          </span>
          <span className="px-3 py-1.5 bg-gray-800 rounded-lg text-xs text-gray-300 border border-gray-700">
            Shorts: <span className="text-red-400 font-semibold">{highConfEntries.filter(e => e.signal === 'SHORT').length}</span>
          </span>
          <span className="px-3 py-1.5 bg-gray-800 rounded-lg text-xs text-gray-300 border border-gray-700">
            Avg Confidence: <span className="text-blue-400 font-semibold">
              {Math.round(highConfEntries.reduce((a, e) => a + e.confidence, 0) / highConfEntries.length)}%
            </span>
          </span>
        </div>
      )}

      {/* ═══ Error ═════════════════════════════════════════════════════ */}
      {scanError && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700/40 rounded-xl text-red-300 text-sm">
          Scan error: {scanError}
        </div>
      )}

      {/* ═══ Signals Grid ════════════════════════════════════════════════ */}
      {highConfEntries.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {highConfEntries.map((entry) => (
            <div
              key={entry.symbol}
              className={`relative overflow-hidden rounded-xl border p-3 md:p-4 transition-all hover:scale-[1.02] ${
                entry.signal === 'LONG'
                  ? 'bg-gradient-to-br from-green-900/30 to-green-800/20 border-green-700/40'
                  : 'bg-gradient-to-br from-red-900/30 to-red-800/20 border-red-700/40'
              }`}
            >
              <div className="absolute top-2 right-2">
                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                  entry.signal === 'LONG' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>{entry.signal}</span>
              </div>
              <p className="text-white font-semibold mb-1">
                {entry.symbol}
                {entry.baseAsset && <span className="text-gray-400 text-xs ml-1">({entry.baseAsset})</span>}
              </p>
              <div className="space-y-1 text-xs mt-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">RSI (1h)</span>
                  <span className={`font-mono font-semibold ${entry.rsi1h < 30 ? 'text-green-400' : 'text-red-400'}`}>
                    {entry.rsi1h}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">3d Momentum</span>
                  <span className={`font-mono font-semibold ${(entry.change3dPercent || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {(entry.change3dPercent || 0) >= 0 ? '+' : ''}{entry.change3dPercent || 0}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">24h Change</span>
                  <span className={`font-mono font-semibold ${(entry.change24hPercent || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {(entry.change24hPercent || 0) >= 0 ? '+' : ''}{entry.change24hPercent || 0}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Price</span>
                  <span className="font-mono text-gray-300">{(entry.lastPrice || 0) < 1 ? entry.lastPrice : parseFloat(entry.lastPrice || 0).toFixed(4)}</span>
                </div>
                {entry.quoteVolume && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Volume</span>
                    <span className="font-mono text-gray-300">{entry.quoteVolume > 1e9 ? (entry.quoteVolume / 1e9).toFixed(2) + 'B' : entry.quoteVolume > 1e6 ? (entry.quoteVolume / 1e6).toFixed(2) + 'M' : entry.quoteVolume > 1e3 ? (entry.quoteVolume / 1e3).toFixed(2) + 'K' : entry.quoteVolume}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-gray-700/50">
                  <span className="text-gray-500">Confidence</span>
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          entry.confidence > 70 ? 'bg-green-500' : entry.confidence > 40 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${entry.confidence}%` }}
                      />
                    </div>
                    <span className="font-mono text-gray-300">{entry.confidence}%</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !scanError && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <svg className="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-lg font-medium">No signals available</p>
            <p className="text-sm mt-1">Waiting for market data...</p>
          </div>
        )
      )}

      {/* ═══ Footer ════════════════════════════════════════════════════ */}
      <footer className="text-center text-gray-500 text-xs md:text-sm py-4 mt-8">
        Bala · RSI + 3d Momentum Signals · Auto-refresh every 3 min · {highConfEntries.length} signals
      </footer>
    </div>
  );
}