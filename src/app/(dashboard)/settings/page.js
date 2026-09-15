'use client';

import { useState, useEffect } from 'react';
import { usePortfolioSettings } from '@/lib/settings';
import { useBackendFuturesStream } from '@/lib/backendWS';
import { useTheme, useWallpaper } from '@/lib/theme';
import { WALLPAPERS } from '@/lib/wallpapers';
import { formatCurrency } from '@/lib/utils';
import LoadingSpinner from '@/components/LoadingSpinner';
import ForceCloseAllButton from '@/components/ForceCloseAllButton';

// Field definitions drive the form so it stays in sync with the settings model.
const FIELDS = [
  {
    key: 'goalTarget',
    label: 'Goal Target',
    unit: 'USD',
    step: '100',
    min: 0,
    help: 'The account balance you are compounding toward.',
  },
  {
    key: 'compoundPercent',
    label: 'Compound % per Trade',
    unit: '%',
    step: '0.1',
    min: 0,
    help: 'Target gain per trade used to project the milestone ladder.',
  },
  {
    key: 'riskPerTradePercent',
    label: 'Risk per Trade',
    unit: '% of wallet',
    step: '0.1',
    min: 0,
    help: 'How much of the wallet you are willing to lose on a single stop loss.',
  },
  {
    key: 'defaultLeverage',
    label: 'Default Leverage',
    unit: 'x',
    step: '1',
    min: 1,
    help: 'Leverage pre-filled when opening a new futures order.',
  },
  {
    key: 'maxLeverageWarn',
    label: 'High-Leverage Warning',
    unit: 'x',
    step: '1',
    min: 1,
    help: 'Positions at or above this leverage are flagged as high risk.',
  },
  {
    key: 'maxOpenPositions',
    label: 'Max Open Positions',
    unit: 'positions',
    step: '1',
    min: 1,
    help: 'A danger badge appears in the header when open positions exceed this.',
  },
  {
    key: 'dailyLossLimitPercent',
    label: 'Daily Loss Circuit Breaker',
    unit: '% of margin',
    step: '0.5',
    min: 0,
    help: "Once today's realized loss reaches this % of margin balance, new orders are blocked.",
  },
  {
    key: 'alarmLossPercent',
    label: 'Daily Loss Alarm',
    unit: '% of margin',
    step: '0.5',
    min: 0,
    help: 'Beep + alert (early warning) when daily loss reaches this % — set below the circuit breaker.',
  },
  {
    key: 'inrRate',
    label: 'USD → INR Rate',
    unit: '₹/$',
    step: '0.5',
    min: 0,
    help: 'Multiplier used to show PnL in rupees.',
  },
];

export default function SettingsPage() {
  const { settings, loading, saving, error, save, reset } = usePortfolioSettings();
  const { account, positions } = useBackendFuturesStream();
  const { theme, setTheme, themes } = useTheme();
  const { wallpaper, opacity, setWallpaper, setOpacity } = useWallpaper();

  const [form, setForm] = useState(settings);
  const [savedFlash, setSavedFlash] = useState(false);
  const [activeSection, setActiveSection] = useState('risk-actions');

  // Sync local form when settings load/change from the server.
  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const isTestnet = process.env.NEXT_PUBLIC_BINANCE_TESTNET === 'true';

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const ok = await save(form);
    if (ok) {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    }
  };

  const handleReset = async () => {
    if (confirm('Reset all portfolio settings to defaults?')) {
      await reset();
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading settings..." />;
  }

  // Derived, read-only account snapshot for context.
  const wallet = account?.totalWalletBalance || 0;
  const openPositions = positions?.length || 0;
  const highLevCount = (positions || []).filter(
    (p) => (p.leverage || 0) >= (Number(form.maxLeverageWarn) || 20),
  ).length;
  const riskPerTradeUsd = wallet * ((Number(form.riskPerTradePercent) || 0) / 100);

  const navLinks = [
    { id: 'risk-actions', label: '⛔ Risk Actions' },
    { id: 'account-status', label: '📡 Account' },
    { id: 'theme', label: '🎨 Theme' },
    { id: 'wallpaper', label: '🖼 Wallpaper' },
    { id: 'preferences', label: '🛠 Preferences' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 md:py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-white">⚙️ Settings</h1>
        <p className="text-gray-500 text-sm mt-1">
          Portfolio goals, risk defaults and display preferences.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left sidebar nav — switches which section is shown */}
        <aside className="md:w-52 md:flex-shrink-0">
          <nav className="md:sticky md:top-24 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible bg-gray-800/40 rounded-xl border border-gray-700 p-2">
            {navLinks.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setActiveSection(l.id)}
                className={`whitespace-nowrap text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeSection === l.id
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700/60'
                }`}
              >
                {l.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content column — only the active section renders */}
        <div className="flex-1 min-w-0">

      {/* Risk Actions */}
      {activeSection === 'risk-actions' && (
      <section className="mb-6 bg-gray-800/50 rounded-xl border border-red-700/40 p-4 md:p-6">
        <h2 className="text-lg font-semibold text-white mb-1">Risk Actions</h2>
        <p className="text-gray-500 text-xs mb-4">
          Positions at <span className="text-yellow-300 font-semibold">20x or higher</span> leverage
          are never auto-closed (huge-order exception).
        </p>

        {/* Auto-close on circuit breaker toggle */}
        <label className="flex items-start gap-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={Number(form.autoCloseOnBreaker) === 1}
            onChange={(e) => handleChange('autoCloseOnBreaker', e.target.checked ? 1 : 0)}
            className="mt-0.5 h-4 w-4 accent-red-500"
          />
          <span>
            <span className="text-sm text-gray-200 font-medium">
              Auto-close all positions when daily loss limit is hit
            </span>
            <span className="block text-gray-500 text-xs mt-0.5">
              When today&apos;s loss reaches {form.dailyLossLimitPercent}% of margin, close every
              position under 20x automatically. Save settings to apply.
            </span>
          </span>
        </label>

        {/* Override: allow new orders even after the daily limit is breached */}
        <label className="flex items-start gap-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={Number(form.allowOrdersAfterBreach) === 1}
            onChange={(e) => handleChange('allowOrdersAfterBreach', e.target.checked ? 1 : 0)}
            className="mt-0.5 h-4 w-4 accent-yellow-500"
          />
          <span>
            <span className="text-sm text-gray-200 font-medium">
              Allow new orders after daily limit is breached
            </span>
            <span className="block text-gray-500 text-xs mt-0.5">
              Override the circuit breaker — new orders (any leverage) are allowed even
              after today&apos;s loss passes {form.dailyLossLimitPercent}%. Use with discipline.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <ForceCloseAllButton />
          <ForceCloseAllButton zero />
          <span className="text-gray-500 text-xs">
            {openPositions} open position{openPositions === 1 ? '' : 's'}. Force Close skips 20x+;
            Zero Order Close exits everything.
          </span>
        </div>
      </section>
      )}

      {/* Account status (read-only) */}
      {activeSection === 'account-status' && (
      <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-3">
          <p className="text-gray-500 text-xs mb-1">API Connection</p>
          <p className="text-green-400 font-semibold text-sm flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            {account ? 'Connected' : 'Connecting…'}
          </p>
        </div>
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-3">
          <p className="text-gray-500 text-xs mb-1">Environment</p>
          <p className={`font-semibold text-sm ${isTestnet ? 'text-yellow-400' : 'text-blue-400'}`}>
            {isTestnet ? 'Testnet' : 'Mainnet (Live)'}
          </p>
        </div>
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-3">
          <p className="text-gray-500 text-xs mb-1">Wallet Balance</p>
          <p className="text-white font-semibold text-sm tabular-nums">{formatCurrency(wallet)}</p>
        </div>
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-3">
          <p className="text-gray-500 text-xs mb-1">Open Positions</p>
          <p className="text-white font-semibold text-sm">
            {openPositions}
            {highLevCount > 0 && (
              <span className="text-red-400 text-xs ml-2">{highLevCount} high-lev</span>
            )}
          </p>
        </div>
      </section>

      )}

      {/* Theme switcher */}
      {activeSection === 'theme' && (
      <section className="mb-6 bg-gray-800/50 rounded-xl border border-gray-700 p-4 md:p-6">
        <h2 className="text-lg font-semibold text-white mb-1">Theme</h2>
        <p className="text-gray-500 text-xs mb-4">
          Pick a look for the dashboard. Applies instantly and is remembered on this device.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {themes.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                className={`group relative rounded-xl border p-3 text-left transition-all ${
                  active
                    ? 'border-blue-500 ring-2 ring-blue-500/40'
                    : 'border-gray-700 hover:border-gray-500'
                }`}
              >
                <div
                  className="h-12 w-full rounded-lg mb-2 border border-white/10"
                  style={{ background: t.swatch }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-200">{t.name}</span>
                  {active && <span className="text-blue-400 text-xs font-semibold">✓</span>}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      )}

      {/* Wallpaper picker */}
      {activeSection === 'wallpaper' && (
      <section className="mb-6 bg-gray-800/50 rounded-xl border border-gray-700 p-4 md:p-6">
        <h2 className="text-lg font-semibold text-white mb-1">Wallpaper</h2>
        <p className="text-gray-500 text-xs mb-4">
          Nature, galaxy and calm backdrops shown faintly behind the dashboard. Applies instantly.
        </p>

        {/* Opacity slider */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-gray-300 whitespace-nowrap">Opacity</span>
          <input
            type="range"
            min="0"
            max="60"
            step="1"
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="flex-1 accent-blue-500 cursor-pointer"
          />
          <span className="text-sm text-gray-400 w-10 tabular-nums text-right">{opacity}%</span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {/* None option */}
          <button
            type="button"
            onClick={() => setWallpaper('')}
            className={`relative aspect-video rounded-lg border flex items-center justify-center text-xs text-gray-300 transition-all ${
              !wallpaper ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-gray-700 hover:border-gray-500'
            }`}
          >
            None
          </button>
          {WALLPAPERS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWallpaper(w.url)}
              title={w.cat}
              className={`relative aspect-video rounded-lg overflow-hidden border transition-all ${
                wallpaper === w.url ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-gray-700 hover:border-gray-500'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.thumb} alt={w.cat} loading="lazy" className="w-full h-full object-cover" />
              {wallpaper === w.url && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-lg">✓</span>
              )}
              <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-[10px] text-gray-200 px-1 py-0.5 text-center">
                {w.cat}
              </span>
            </button>
          ))}
        </div>
        <p className="text-gray-600 text-[11px] mt-3">
          Photos from Unsplash — free to use under the Unsplash License.
        </p>
      </section>
      )}

      {/* Settings form */}
      {activeSection === 'preferences' && (
      <section className="bg-gray-800/50 rounded-xl border border-gray-700 p-4 md:p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Portfolio Preferences</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-sm text-gray-300 mb-1">
                {f.label} <span className="text-gray-500">({f.unit})</span>
              </label>
              <input
                type="number"
                min={f.min}
                step={f.step}
                value={form[f.key] ?? ''}
                onChange={(e) => handleChange(f.key, e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 tabular-nums"
              />
              <p className="text-gray-500 text-xs mt-1">{f.help}</p>
            </div>
          ))}
        </div>

        {/* Live helper based on current inputs */}
        <div className="mt-5 rounded-lg bg-gray-900/70 border border-gray-700 p-3 text-xs text-gray-400 space-y-1">
          <p>
            Risk per trade at current wallet:{' '}
            <span className="text-red-300 font-semibold">{formatCurrency(riskPerTradeUsd)}</span>
          </p>
          <p>
            Goal:{' '}
            <span className="text-green-300 font-semibold">
              {formatCurrency(Number(form.goalTarget) || 0)}
            </span>{' '}
            · compounding{' '}
            <span className="text-blue-300 font-semibold">{form.compoundPercent}%</span> per trade
          </p>
        </div>

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
          <button
            onClick={handleReset}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors"
          >
            Reset to Defaults
          </button>
          {savedFlash && <span className="text-green-400 text-sm">✓ Saved</span>}
        </div>
      </section>
      )}

        </div>{/* end content column */}
      </div>{/* end flex row */}

      <footer className="text-center text-gray-500 text-xs md:text-sm py-4 mt-6">
        Settings are stored securely and apply across the dashboard.
      </footer>
    </div>
  );
}
