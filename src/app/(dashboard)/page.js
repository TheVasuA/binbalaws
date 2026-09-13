'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { formatCurrency } from '@/lib/utils';
import { useBackendFuturesStream } from '@/lib/backendWS';
import { usePortfolioSettings } from '@/lib/settings';
import { useNotify } from '@/lib/notify';
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

  // Daily loss circuit breaker status — limit is a % of WALLET balance.
  const dailyLossLimitPercent = Number(settings?.dailyLossLimitPercent) || 10;
  const walletBalance = Number(mergedAccount?.totalWalletBalance) || 0;
  const dailyLossLimitUsd = walletBalance * (dailyLossLimitPercent / 100);
  const todayRealized = Number(dailyPnl?.realizedPnl) || 0;
  // Live unrealized moves every price tick; combined = live "today" PnL.
  const liveUnrealized = Number(mergedAccount?.totalUnrealizedProfit) || 0;
  const todayNet = todayRealized + liveUnrealized;

  // Loss bar reflects the LIVE net drawdown (realized + unrealized) so it moves.
  const todayLoss = Math.max(0, -todayNet);
  // Breaker fires on REALIZED loss only (server enforces on realized), so a
  // floating drawdown that can still recover won't hard-block orders.
  const realizedLoss = Math.max(0, -todayRealized);
  const breakerTripped = dailyLossLimitUsd > 0 && realizedLoss >= dailyLossLimitUsd;
  const breakerNear = !breakerTripped && dailyLossLimitUsd > 0 && realizedLoss >= dailyLossLimitUsd * 0.7;

  // Alarm level: fires the beep when today's loss reaches the configured % of
  // wallet balance (an early warning ahead of the hard block).
  const alarmLossPercent = Number(settings?.alarmLossPercent) || 8;
  const alarmLossUsd = walletBalance * (alarmLossPercent / 100);
  const lossPercentOfMargin = walletBalance > 0 ? (realizedLoss / walletBalance) * 100 : 0;

  // Today's target from the compound rule: aim for compoundPercent% of wallet.
  // Progress uses the live net PnL (realized + unrealized) so it moves.
  const compoundPercent = Number(settings?.compoundPercent) || 2;
  const todayTargetUsd = walletBalance * (compoundPercent / 100);
  const todayProfit = Math.max(0, todayNet); // for the target bar (>=0)

  // ── Notifications ──────────────────────────────────────────────────────────
  const { notify } = useNotify();
  const notifiedRef = useRef({
    alarm: false,
    breaker: false,
    posLimit: false,
    wsDown: false,
    autoClosed: false,
  });

  const autoCloseOnBreaker = Number(settings?.autoCloseOnBreaker) === 1;

  // 8% daily-loss alarm (beep + danger toast). Fires once per crossing.
  useEffect(() => {
    if (walletBalance <= 0) return;
    if (realizedLoss >= alarmLossUsd && !notifiedRef.current.alarm) {
      notifiedRef.current.alarm = true;
      notify({
        level: 'danger',
        beep: true,
        sticky: true,
        title: `⚠ Daily loss alarm — ${lossPercentOfMargin.toFixed(1)}% of wallet`,
        message: `Today's realized loss is ${formatCurrency(realizedLoss)}. Hard block at ${dailyLossLimitPercent}% (${formatCurrency(dailyLossLimitUsd)}).`,
      });
    }
    // Reset the alarm latch if loss recovers back under ~85% of the alarm level.
    if (realizedLoss < alarmLossUsd * 0.85 && notifiedRef.current.alarm) {
      notifiedRef.current.alarm = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realizedLoss, alarmLossUsd, walletBalance]);

  // Circuit breaker tripped (10%): louder danger toast, once.
  useEffect(() => {
    if (breakerTripped && !notifiedRef.current.breaker) {
      notifiedRef.current.breaker = true;
      notify({
        level: 'danger',
        beep: true,
        sticky: true,
        title: '🛑 Circuit breaker tripped — orders blocked',
        message: `Daily realized loss ${formatCurrency(realizedLoss)} reached the ${dailyLossLimitPercent}% limit. New orders under 20x are blocked until tomorrow.`,
      });
    }
    if (!breakerTripped && notifiedRef.current.breaker) {
      notifiedRef.current.breaker = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakerTripped]);

  // Auto-close all positions (except >=20x) when the breaker trips, if enabled.
  useEffect(() => {
    if (!autoCloseOnBreaker) return;
    if (breakerTripped && !notifiedRef.current.autoClosed) {
      notifiedRef.current.autoClosed = true;
      (async () => {
        try {
          const res = await fetch('/api/futures', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'closeAll' }),
          });
          const json = await res.json();
          const { closed = 0, skipped = 0, failed = 0 } = json?.data || {};
          notify({
            level: failed > 0 ? 'warning' : 'danger',
            beep: true,
            sticky: true,
            title: '🛑 Auto-close triggered (daily loss limit)',
            message: `Closed ${closed} · skipped ${skipped} (20x+)${failed ? ` · failed ${failed}` : ''}`,
          });
          refetchPositions();
        } catch (err) {
          notify({ level: 'danger', beep: true, title: 'Auto-close failed', message: err.message });
        }
      })();
    }
    if (!breakerTripped && notifiedRef.current.autoClosed) {
      notifiedRef.current.autoClosed = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakerTripped, autoCloseOnBreaker]);

  // Too many open positions.
  useEffect(() => {
    if (positionsOverLimit && !notifiedRef.current.posLimit) {
      notifiedRef.current.posLimit = true;
      notify({
        level: 'warning',
        beep: true,
        title: 'Too many open positions',
        message: `${openPositionCount} open — your max is ${maxOpenPositions}. Consider closing some.`,
      });
    }
    if (!positionsOverLimit && notifiedRef.current.posLimit) {
      notifiedRef.current.posLimit = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionsOverLimit, openPositionCount, maxOpenPositions]);

  // Live price feed connection lost / restored.
  useEffect(() => {
    if (!loaded) return;
    if (!wsConnected && !notifiedRef.current.wsDown) {
      notifiedRef.current.wsDown = true;
      notify({
        level: 'warning',
        title: 'Live price feed disconnected',
        message: 'Prices may be delayed. Reconnecting…',
      });
    }
    if (wsConnected && notifiedRef.current.wsDown) {
      notifiedRef.current.wsDown = false;
      notify({ level: 'success', title: 'Live feed reconnected' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsConnected, loaded]);

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
      <div className="sticky top-16 z-30 flex flex-row items-stretch gap-2 md:gap-4 mb-6 bg-gray-900/95 backdrop-blur-md rounded-2xl border border-gray-700/50">
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

              {/* Today's target + daily loss limit bars — side by side, use full width */}
              <div className="w-full md:flex-1 md:ml-6 self-end grid grid-cols-2 gap-6">
                {/* Today's Target (compound rule) */}
                {(() => {
                  const hit = todayTargetUsd > 0 && todayProfit >= todayTargetUsd;
                  const pct = todayTargetUsd > 0
                    ? Math.min((todayProfit / todayTargetUsd) * 100, 100)
                    : 0;
                  return (
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-gray-500 uppercase tracking-wider">Today&apos;s Target ({compoundPercent}%)</span>
                        <span className={`tabular-nums font-medium ${hit ? 'text-green-400' : 'text-gray-400'}`}>
                          {formatCurrency(todayProfit)} / {formatCurrency(todayTargetUsd)}
                        </span>
                      </div>
                      {/* Fills right → left (green) */}
                      <div className="relative w-full bg-gray-700/60 rounded-full h-2.5 overflow-hidden flex justify-end">
                        <div
                          className="h-full rounded-full bg-gradient-to-l from-green-500 to-emerald-400 transition-all duration-500"
                          style={{ width: `${Math.max(pct, todayProfit > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-600 mt-0.5 text-left md:text-right">
                        {hit ? '🎯 Target reached for today!' : `${pct.toFixed(0)}% of daily target`}
                      </p>
                    </div>
                  );
                })()}

                {/* Daily loss limit bar (calculated from wallet balance) */}
                {(() => {
                  const used = dailyLossLimitUsd > 0
                    ? Math.min((todayLoss / dailyLossLimitUsd) * 100, 100)
                    : 0;
                  return (
                    <div>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-gray-500 uppercase tracking-wider">Daily Loss Limit ({dailyLossLimitPercent}%)</span>
                        <span className={`tabular-nums font-medium ${used >= 70 ? 'text-red-400' : 'text-gray-400'}`}>
                          {formatCurrency(todayLoss)} / {formatCurrency(dailyLossLimitUsd)}
                        </span>
                      </div>
                      {/* Fills left → right (red) */}
                      <div className="relative w-full bg-gray-700/60 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-500"
                          style={{ width: `${Math.max(used, todayLoss > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-600 mt-0.5 text-left md:text-right">
                        {used >= 100
                          ? 'Limit hit — new orders blocked'
                          : `${used.toFixed(0)}% of daily limit used`}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* PnL card */}
        <div className="w-32 md:w-44 flex-shrink-0 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-2 md:p-3 border border-gray-700/50 flex flex-col justify-center">
          <p className="text-gray-500 text-[10px] md:text-xs mb-1">PnL</p>
          <p className={`text-sm md:text-2xl font-bold tabular-nums truncate transition-colors duration-300 ${
            (futuresAccount?.totalUnrealizedProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {(futuresAccount?.totalUnrealizedProfit || 0) >= 0 ? '+' : ''}
            {formatCurrency(futuresAccount?.totalUnrealizedProfit || 0)}
          </p>
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