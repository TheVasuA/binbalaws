'use client';

import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { useFetch, formatCurrency } from '@/lib/utils';
import {
  PERIODS, mergeFills, filterByPeriod, summarize, buildTimeSeries, buildByCoin,
  maxDrawdown, advancedStats, buildByWeekday, buildByHour, bestWorstDay,
} from '@/lib/tradeAnalytics';

const VIEWS = [
  { id: 'overview', label: '📊 Overview' },
  { id: 'insights', label: '🧠 Insights' },
  { id: 'coins', label: '🪙 By Coin' },
  { id: 'log', label: '📜 Trade Log' },
];

const fmtDate = (ts) =>
  new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// Small stat card
function Stat({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-3 md:p-4">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className={`text-lg md:text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

// Recharts tooltip styled for the dark theme
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-600 bg-gray-900/95 px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-300 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="tabular-nums" style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function HistoryPage() {
  const [view, setView] = useState('overview');
  const [period, setPeriod] = useState('1m');

  const { data: trades, loading, error, refetch } = useFetch('/api/trades?type=pnl&limit=1000');

  // Merge partial-fill records into one trade per close (same symbol + second).
  const merged = useMemo(() => mergeFills(trades || []), [trades]);
  const scoped = useMemo(() => filterByPeriod(merged, period), [merged, period]);
  const stats = useMemo(() => advancedStats(scoped), [scoped]);
  const series = useMemo(() => buildTimeSeries(scoped, period), [scoped, period]);
  const byCoin = useMemo(() => buildByCoin(scoped), [scoped]);
  const dd = useMemo(() => maxDrawdown(series), [series]);
  const byWeekday = useMemo(() => buildByWeekday(scoped), [scoped]);
  const byHour = useMemo(() => buildByHour(scoped), [scoped]);
  const days = useMemo(() => bestWorstDay(scoped), [scoped]);

  const periodLabel = PERIODS.find((p) => p.id === period)?.label || '';
  const winData = [
    { name: 'Wins', value: stats.wins, color: '#22c55e' },
    { name: 'Losses', value: stats.losses, color: '#ef4444' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 md:py-8">
      {/* Header + period tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">📈 History & Analysis</h1>
          <p className="text-gray-500 text-sm mt-1">Realized PnL · {periodLabel} window</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-gray-800/60 border border-gray-700 rounded-xl p-1">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === p.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={refetch}
            disabled={loading}
            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-50 rounded-lg transition-all"
            title="Refresh"
          >
            <svg className={`w-4 h-4 text-white ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400 text-sm">
          Error: {error}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left sidebar */}
        <aside className="md:w-48 md:flex-shrink-0">
          <nav className="md:sticky md:top-24 flex md:flex-col gap-1 overflow-x-auto bg-gray-800/40 rounded-xl border border-gray-700 p-2">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`whitespace-nowrap text-left px-3 py-2 rounded-lg text-sm transition-colors ${
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
          {loading && !trades ? (
            <div className="flex justify-center py-16">
              <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : scoped.length === 0 ? (
            <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-10 text-center text-gray-500">
              No closed trades in the {periodLabel} window.
            </div>
          ) : (
            <>
              {/* ── OVERVIEW ─────────────────────────────────────────── */}
              {view === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Stat label="Net PnL" value={`${stats.net >= 0 ? '+' : ''}${formatCurrency(stats.net)}`}
                      color={stats.net >= 0 ? 'text-green-400' : 'text-red-400'} sub={`${stats.count} trades`} />
                    <Stat label="Win Rate" value={`${stats.winRate.toFixed(1)}%`}
                      color="text-blue-400" sub={`${stats.wins}W / ${stats.losses}L`} />
                    <Stat label="Profit Factor" value={stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
                      color="text-purple-400" sub={`expectancy ${formatCurrency(stats.expectancy)}`} />
                    <Stat label="Max Drawdown" value={`-${formatCurrency(dd.maxDrawdown)}`}
                      color="text-orange-400" sub={`${days.greenDays}🟢 / ${days.redDays}🔴 days`} />
                  </div>

                  {/* Cumulative PnL area */}
                  <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Cumulative PnL</h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={series} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                        <defs>
                          <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                        <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 11 }} minTickGap={20} />
                        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} width={50} />
                        <Tooltip content={<ChartTooltip />} />
                        <ReferenceLine y={0} stroke="#6b7280" />
                        <Area type="monotone" dataKey="cumulative" name="Cumulative" stroke="#3b82f6" strokeWidth={2} fill="url(#pnlFill)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Per-bucket PnL bars */}
                    <div className="lg:col-span-2 bg-gray-800/50 rounded-xl border border-gray-700 p-4">
                      <h3 className="text-sm font-semibold text-white mb-3">
                        PnL per {period === '1d' ? 'hour' : 'day'}
                      </h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={series} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                          <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 11 }} minTickGap={20} />
                          <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} width={50} />
                          <Tooltip content={<ChartTooltip />} cursor={{ fill: '#ffffff10' }} />
                          <ReferenceLine y={0} stroke="#6b7280" />
                          <Bar dataKey="pnl" name="PnL" radius={[3, 3, 0, 0]}>
                            {series.map((d, i) => (
                              <Cell key={i} fill={d.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Win rate donut */}
                    <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
                      <h3 className="text-sm font-semibold text-white mb-3">Win / Loss</h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={winData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2}>
                            {winData.map((d) => <Cell key={d.name} fill={d.color} />)}
                          </Pie>
                          <Tooltip content={<ChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                      <p className="text-center text-2xl font-bold text-white -mt-2">{stats.winRate.toFixed(0)}%</p>
                      <p className="text-center text-gray-500 text-xs">{stats.wins} wins · {stats.losses} losses</p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── INSIGHTS ─────────────────────────────────────────── */}
              {view === 'insights' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Stat label="Expectancy / trade" value={formatCurrency(stats.expectancy)}
                      color={stats.expectancy >= 0 ? 'text-green-400' : 'text-red-400'} sub="avg outcome per trade" />
                    <Stat label="Avg Win / Loss" value={formatCurrency(stats.avgWin)}
                      color="text-green-400" sub={`avg loss ${formatCurrency(stats.avgLoss)}`} />
                    <Stat label="Win Streak" value={`${stats.maxWinStreak}`}
                      color="text-green-400" sub={`loss streak ${stats.maxLossStreak}`} />
                    <Stat label="Best Day"
                      value={days.best ? `${formatCurrency(days.best.pnl)}` : '—'}
                      color="text-green-400"
                      sub={days.worst ? `worst ${formatCurrency(days.worst.pnl)}` : ''} />
                  </div>

                  {/* PnL by day of week */}
                  <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">PnL by Day of Week</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={byWeekday} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} width={50} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: '#ffffff10' }} />
                        <ReferenceLine y={0} stroke="#6b7280" />
                        <Bar dataKey="pnl" name="PnL" radius={[3, 3, 0, 0]}>
                          {byWeekday.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#22c55e' : '#ef4444'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* PnL by hour of day */}
                  <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">PnL by Hour of Day</h3>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={byHour} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                        <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} interval={1} />
                        <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} width={50} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: '#ffffff10' }} />
                        <ReferenceLine y={0} stroke="#6b7280" />
                        <Bar dataKey="pnl" name="PnL" radius={[3, 3, 0, 0]}>
                          {byHour.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#22c55e' : '#ef4444'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="text-gray-500 text-xs mt-2">Local time. Spot when you trade best.</p>
                  </div>
                </div>
              )}

              {/* ── BY COIN ──────────────────────────────────────────── */}
              {view === 'coins' && (
                <div className="space-y-6">
                  <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">Net PnL by Coin</h3>
                    <ResponsiveContainer width="100%" height={Math.max(220, byCoin.length * 34)}>
                      <BarChart data={byCoin} layout="vertical" margin={{ top: 5, right: 16, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} horizontal={false} />
                        <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                        <YAxis type="category" dataKey="symbol" tick={{ fill: '#e5e7eb', fontSize: 12 }} width={64} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: '#ffffff10' }} />
                        <ReferenceLine x={0} stroke="#6b7280" />
                        <Bar dataKey="net" name="Net PnL" radius={[0, 3, 3, 0]}>
                          {byCoin.map((d, i) => <Cell key={i} fill={d.net >= 0 ? '#22c55e' : '#ef4444'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Per-coin table */}
                  <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-700 text-gray-400">
                          <th className="text-left py-2 px-4 font-medium">Coin</th>
                          <th className="text-right py-2 px-4 font-medium">Trades</th>
                          <th className="text-right py-2 px-4 font-medium">Profit</th>
                          <th className="text-right py-2 px-4 font-medium">Loss</th>
                          <th className="text-right py-2 px-4 font-medium">Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {byCoin.map((c) => (
                          <tr key={c.symbol} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                            <td className="py-2.5 px-4 text-white font-medium">{c.symbol}</td>
                            <td className="py-2.5 px-4 text-right text-gray-400">{c.count}</td>
                            <td className="py-2.5 px-4 text-right text-green-400">+{formatCurrency(c.profit)}</td>
                            <td className="py-2.5 px-4 text-right text-red-400">{formatCurrency(c.loss)}</td>
                            <td className={`py-2.5 px-4 text-right font-bold ${c.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {c.net >= 0 ? '+' : ''}{formatCurrency(c.net)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── TRADE LOG ────────────────────────────────────────── */}
              {view === 'log' && (
                <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
                  <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Trade Log</h3>
                    <span className="text-gray-500 text-xs">{scoped.length} trades</span>
                  </div>
                  <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-800">
                        <tr className="border-b border-gray-700 text-gray-400">
                          <th className="text-left py-2 px-4 font-medium">#</th>
                          <th className="text-left py-2 px-4 font-medium">Symbol</th>
                          <th className="text-left py-2 px-4 font-medium">Date</th>
                          <th className="text-right py-2 px-4 font-medium">Realized PnL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...scoped].sort((a, b) => b.timestamp - a.timestamp).map((t, i) => (
                          <tr key={t.id || i} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                            <td className="py-2.5 px-4 text-gray-500">{i + 1}</td>
                            <td className="py-2.5 px-4 text-white font-medium">
                              {(t.symbol || '').replace(/USDT$/, '')}
                              {t.fills > 1 && (
                                <span className="ml-2 text-[10px] text-gray-500">{t.fills} fills</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-gray-400">{fmtDate(t.timestamp)}</td>
                            <td className={`py-2.5 px-4 text-right font-bold ${Number(t.income) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {Number(t.income) >= 0 ? '+' : ''}{formatCurrency(t.income)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
