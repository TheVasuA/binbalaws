'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatCurrency } from '@/lib/utils';
import { useBackendFuturesStream } from '@/lib/backendWS';
import { usePortfolioSettings } from '@/lib/settings';
import { calculateFuturesRiskMetrics } from '@/lib/risk';
import LoadingSpinner from '@/components/LoadingSpinner';
import FuturesPositions from '@/components/FuturesPositions';
import FuturesRiskMetrics from '@/components/FuturesRiskMetrics';
import PositionCharts from '@/components/PositionCharts';

export default function FuturesPage() {
  const [displayError, setDisplayError] = useState(null);

  // ── REST: Fetches every 2s + WebSocket for live prices ────────────────────
  const {
    account: futuresAccount,
    positions: futuresPositions,
    openOrders,
    wsConnected,
    error: wsError,
    refetch: refetchPositions,
    loaded,
    dailyPnl,
  } = useBackendFuturesStream();

  const { settings } = usePortfolioSettings();

  const mergedAccount = futuresAccount;
  const loading = !loaded;
  const hasData = !!futuresAccount;

  // Danger badge when open positions exceed the configured maximum.
  const openPositionCount = futuresPositions?.length || 0;
  const maxOpenPositions = Number(settings?.maxOpenPositions) || 3;
  const positionsOverLimit = openPositionCount > maxOpenPositions;

  // Daily loss circuit breaker status.
  const dailyLossLimitPercent = Number(settings?.dailyLossLimitPercent) || 10;
  const marginBalance = Number(mergedAccount?.totalMarginBalance) || 0;
  const dailyLossLimitUsd = marginBalance * (dailyLossLimitPercent / 100);
  const todayRealized = Number(dailyPnl?.realizedPnl) || 0;
  const todayLoss = Math.max(0, -todayRealized); // positive number = loss today
  const breakerTripped = dailyLossLimitUsd > 0 && todayLoss >= dailyLossLimitUsd;
  const breakerNear = !breakerTripped && dailyLossLimitUsd > 0 && todayLoss >= dailyLossLimitUsd * 0.7;

  const futuresRiskMetrics = useMemo(
    () => calculateFuturesRiskMetrics(futuresPositions, futuresAccount),
    [futuresPositions, futuresAccount],
  );

  // Error display
  useEffect(() => {
    if (wsError) setDisplayError(wsError);
    else if (displayError) {
      const t = setTimeout(() => setDisplayError(null), 3000);
      return () => clearTimeout(t);
    }
  }, [wsError]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading && !hasData) {
    return <LoadingSpinner text="Loading futures data..." />;
  }

  return (
    <div className="max-w-full xl:max-w-screen-2xl mx-auto px-2 sm:px-6 lg:px-12 py-4 md:py-8 flex flex-col">
      {/* ═══ Portfolio Header ═══════════════════════════════════════════════════ */}
      <div className="sticky top-16 z-30 flex flex-col md:flex-row gap-4 mb-6 bg-gray-900/95 backdrop-blur-md rounded-2xl border border-gray-700/50">
        {/* Live Balance Card */}
        <div className="flex-1 min-w-0 relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border border-gray-700/50 shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
          <div className="relative p-2 md:p-3">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-2">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {positionsOverLimit && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                      ⚠ {openPositionCount} open · max {maxOpenPositions}
                    </span>
                  )}
                  {breakerTripped && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-600/30 text-red-300 border border-red-500/60 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                      🛑 Daily loss limit hit · orders blocked (−{formatCurrency(todayLoss)})
                    </span>
                  )}
                  {breakerNear && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                      ⚠ Nearing daily loss limit (−{formatCurrency(todayLoss)} / {formatCurrency(dailyLossLimitUsd)})
                    </span>
                  )}
                </div>
                <p className="text-3xl md:text-4xl font-bold tabular-nums bg-gradient-to-r from-white via-white to-gray-400 bg-clip-text text-transparent">
                  {formatCurrency(mergedAccount?.totalMarginBalance || 0, 2)}
                </p>
              </div>
              <div className="text-left md:text-right">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Goal Target</p>
                <p className="text-2xl md:text-3xl font-bold text-transparent bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text">
                  $100,000
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="flex-1 min-w-0 grid grid-cols-3 gap-2 md:gap-3">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-2 md:p-3 border border-gray-700/50">
            <p className="text-gray-500 text-xs mb-1">Wallet</p>
            <p className="text-base md:text-xl font-bold text-white tabular-nums">
              {formatCurrency(mergedAccount?.totalWalletBalance || 0)}
            </p>
          </div>
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-2 md:p-3 border border-gray-700/50">
            <p className="text-gray-500 text-xs mb-1">Available</p>
            <p className="text-base md:text-xl font-bold text-white tabular-nums">
              {formatCurrency(mergedAccount?.availableBalance || 0)}
            </p>
          </div>
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-2 md:p-3 border border-gray-700/50">
            <p className="text-gray-500 text-xs mb-1">PnL</p>
            <p className={`text-base md:text-xl font-bold tabular-nums transition-colors duration-300 ${
              (futuresAccount?.totalUnrealizedProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {(futuresAccount?.totalUnrealizedProfit || 0) >= 0 ? '+' : ''}
              {formatCurrency(futuresAccount?.totalUnrealizedProfit || 0)}
            </p>
          </div>
        </div>
      </div>

      {/* ═══ Risk Analysis ════════════════════════════════════════════════════════ */}
      <section className="mb-4 md:mb-8">
        <h2 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4">Futures Risk Analysis</h2>
        {!hasData ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <FuturesRiskMetrics metrics={futuresRiskMetrics} account={futuresAccount} positions={futuresPositions} />
        )}
      </section>

      {/* ═══ Open Positions ═══════════════════════════════════════════════════════ */}
      <section className="bg-gray-800/50 rounded-xl border border-gray-700 p-3 md:p-6 mb-4 md:mb-8">
        <h2 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4">Open Positions</h2>
        {!hasData ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <FuturesPositions
            positions={futuresPositions}
            onRefresh={refetchPositions}
            pendingOrders={openOrders}
          />
        )}
      </section>

      {/* ═══ Position Charts ══════════════════════════════════════════════════════ */}
      {futuresPositions && futuresPositions.length > 0 && (
        <PositionCharts positions={futuresPositions} />
      )}

      {/* ═══ Error Toast ══════════════════════════════════════════════════════════ */}
      {displayError && (
        <div className="fixed bottom-4 left-4 z-50 max-w-xs w-[calc(100vw-2rem)] md:w-80">
          <div className="bg-gray-900 border border-red-500/60 rounded-xl shadow-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-red-400 text-lg mt-0.5">⚠️</span>
              <div className="flex-1 min-w-0">
                <h4 className="text-red-400 font-semibold text-sm mb-1">Error</h4>
                <p className="text-gray-300 text-xs break-words leading-relaxed">{displayError}</p>
              </div>
              <button onClick={() => setDisplayError(null)} className="text-gray-500 hover:text-gray-300 text-lg leading-none ml-1">×</button>
            </div>
            <button onClick={refetchPositions} className="mt-3 w-full py-1.5 bg-red-600/80 hover:bg-red-500 text-white rounded-lg text-xs font-medium">
              Retry
            </button>
          </div>
        </div>
      )}

      <footer className="text-center text-gray-500 text-xs md:text-sm py-4">
        Bala · Live Balance via Binance WebSocket ·{' '}
        <span className={wsConnected ? 'text-green-400' : 'text-gray-600'}>
          {wsConnected ? '● Live' : '○ Connecting...'}
        </span>
      </footer>
    </div>
  );
}