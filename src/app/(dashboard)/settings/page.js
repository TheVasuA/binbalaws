'use client';

import { useState, useEffect } from 'react';
import { usePortfolioSettings } from '@/lib/settings';
import { useBackendFuturesStream } from '@/lib/backendWS';
import { useTheme } from '@/lib/theme';
import { formatCurrency } from '@/lib/utils';
import LoadingSpinner from '@/components/LoadingSpinner';

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

  const [form, setForm] = useState(settings);
  const [savedFlash, setSavedFlash] = useState(false);

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

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-4 md:py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-white">⚙️ Settings</h1>
        <p className="text-gray-500 text-sm mt-1">
          Portfolio goals, risk defaults and display preferences.
        </p>
      </div>

      {/* Account status (read-only) */}
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

      {/* Theme switcher */}
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

      {/* Settings form */}
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

      <footer className="text-center text-gray-500 text-xs md:text-sm py-4 mt-6">
        Settings are stored securely and apply across the dashboard.
      </footer>
    </div>
  );
}
