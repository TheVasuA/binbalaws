'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFetch, formatCurrency } from '@/lib/utils';
import { useBinanceFuturesStream } from '@/lib/binanceWS';
import { calculateFuturesRiskMetrics } from '@/lib/risk';
import LoadingSpinner from '@/components/LoadingSpinner';
import FuturesPositions from '@/components/FuturesPositions';
import FuturesRiskMetrics from '@/components/FuturesRiskMetrics';
import PositionCharts from '@/components/PositionCharts';

export default function FuturesPage() {
  const [displayError, setDisplayError] = useState(null);

  const {
    data: futuresData,
    loading: futuresLoading,
    error: futuresError,
    refetch: refetchFutures,
  } = useFetch('/api/futures?type=positions');

  const {
    account: futuresAccount,
    positions: futuresPositions,
    openOrders,
    connected: wsConnected,
    error: wsError,
  } = useBinanceFuturesStream({ initialData: futuresData });

  const futuresRiskMetrics = useMemo(
    () => calculateFuturesRiskMetrics(futuresPositions, futuresAccount),
    [futuresPositions, futuresAccount],
  );

  const currentBalance =
    (futuresAccount?.totalWalletBalance || 0) +
    (futuresAccount?.totalUnrealizedProfit || 0);

  useEffect(() => {
    const err = futuresError || wsError;
    if (err) {
      setDisplayError(err);
    } else if (displayError) {
      const timer = setTimeout(() => setDisplayError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [futuresError, wsError, displayError]);

  if (futuresLoading && !futuresData) {
    return <LoadingSpinner text="Loading futures data..." />;
  }

  return (
    <div className="max-w-full xl:max-w-screen-2xl mx-auto px-2 sm:px-6 lg:px-12 py-4 md:py-8 flex flex-col">
      <div className="sticky top-16 z-30 flex flex-col md:flex-row gap-4 mb-6 bg-gray-900/95 backdrop-blur-md rounded-2xl border border-gray-700/50">
        <div className="flex-1 min-w-0 relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border border-gray-700/50 shadow-2xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
          <div className="relative p-2 md:p-3">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 mb-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-gray-500 text-xs uppercase tracking-wider">Current Balance</p>
                  <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`} title={wsConnected ? 'Live' : 'Connecting...'} />
                  {wsConnected && <span className="text-green-400 text-xs font-mono">LIVE</span>}
                </div>
                <p className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white via-white to-gray-400 bg-clip-text text-transparent">
                  {formatCurrency(currentBalance, 2)}
                </p>
                {futuresAccount?.totalUnrealizedProfit !== undefined && (
                  <div className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    futuresAccount.totalUnrealizedProfit >= 0
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {futuresAccount.totalUnrealizedProfit >= 0 ? '↑' : '↓'}
                    {futuresAccount.totalUnrealizedProfit >= 0 ? '+' : ''}{formatCurrency(futuresAccount.totalUnrealizedProfit)} unrealized
                  </div>
                )}
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
        <div className="flex-1 min-w-0 grid grid-cols-3 gap-2 md:gap-3">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-2 md:p-3 border border-gray-700/50">
            <p className="text-gray-500 text-xs mb-1">Wallet</p>
            <p className="text-base md:text-xl font-bold text-white">{formatCurrency(futuresAccount?.totalWalletBalance || 0)}</p>
          </div>
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-2 md:p-3 border border-gray-700/50">
            <p className="text-gray-500 text-xs mb-1">Margin</p>
            <p className="text-base md:text-xl font-bold text-white">{formatCurrency(futuresAccount?.availableBalance || 0)}</p>
          </div>
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-2 md:p-3 border border-gray-700/50">
            <p className="text-gray-500 text-xs mb-1">PnL</p>
            <p className={`text-base md:text-xl font-bold ${(futuresAccount?.totalUnrealizedProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(futuresAccount?.totalUnrealizedProfit || 0) >= 0 ? '+' : ''}{formatCurrency(futuresAccount?.totalUnrealizedProfit || 0)}
            </p>
          </div>
        </div>
      </div>

      <section className="mb-4 md:mb-8">
        <h2 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4">Futures Risk Analysis</h2>
        {futuresLoading && !futuresAccount ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <FuturesRiskMetrics metrics={futuresRiskMetrics} account={futuresAccount} positions={futuresPositions} />
        )}
      </section>

      <section className="bg-gray-800/50 rounded-xl border border-gray-700 p-3 md:p-6 mb-4 md:mb-8">
        <h2 className="text-lg md:text-xl font-semibold text-white mb-3 md:mb-4">Open Positions</h2>
        {futuresLoading && !futuresData ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <FuturesPositions
            positions={futuresPositions}
            onRefresh={refetchFutures}
            pendingOrders={openOrders}
          />
        )}
      </section>

      {futuresPositions && futuresPositions.length > 0 && (
        <PositionCharts positions={futuresPositions} />
      )}

      {displayError && (
        <div className="fixed bottom-4 left-4 z-50 max-w-xs w-[calc(100vw-2rem)] md:w-80">
          <div className="bg-gray-900 border border-red-500/60 rounded-xl shadow-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-red-400 text-lg mt-0.5">⚠️</span>
              <div className="flex-1 min-w-0">
                <h4 className="text-red-400 font-semibold text-sm mb-1">Connection Error</h4>
                <p className="text-gray-300 text-xs break-words leading-relaxed">{displayError}</p>
              </div>
              <button onClick={() => setDisplayError(null)} className="text-gray-500 hover:text-gray-300 text-lg leading-none ml-1">×</button>
            </div>
            <div className="mt-3">
              <button onClick={refetchFutures} className="w-full py-1.5 bg-red-600/80 hover:bg-red-500 text-white rounded-lg text-xs font-medium">
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="text-center text-gray-500 text-xs md:text-sm py-4">
        <p>Bala</p>
      </footer>
    </div>
  );
}
