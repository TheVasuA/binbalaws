'use client';

import { useState, useEffect } from 'react';
import { usePortfolioSettings } from '@/lib/settings';
import { useBackendFuturesStream } from '@/lib/backendWS';
import { useTheme, useWallpaper } from '@/lib/theme';
import { WALLPAPERS } from '@/lib/wallpapers';
import { formatCurrency } from '@/lib/utils';
import LoadingSpinner from '@/components/LoadingSpinner';
import ForceCloseAllButton from '@/components/ForceCloseAllButton';
import SettingsPasswordGate from '@/components/SettingsPasswordGate';

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
  // Base balance input: `null` = show the saved value, string = user is editing.
  const [baseDraft, setBaseDraft] = useState(null);
  const [baseFlash, setBaseFlash] = useState(null); // 'set' | 'off' | null
  const [authState, setAuthState] = useState('checking'); // checking | locked | unlocked
  const [appPwCurrent, setAppPwCurrent] = useState('');
  const [appPwNew, setAppPwNew] = useState('');
  const [appPwConfirm, setAppPwConfirm] = useState('');
  const [appPwError, setAppPwError] = useState('');
  const [appPwSaved, setAppPwSaved] = useState(false);
  const [appPwSaving, setAppPwSaving] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaved, setPwSaved] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings/auth', { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setAuthState(j.authenticated ? 'unlocked' : 'locked'))
      .catch(() => setAuthState('locked'));
  }, []);

  const handleLockSettings = async () => {
    await fetch('/api/settings/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'logout' }),
    });
    setAuthState('locked');
    setPwCurrent('');
    setPwNew('');
    setPwConfirm('');
  };

  const handleChangeAppPassword = async (e) => {
    e.preventDefault();
    setAppPwError('');
    setAppPwSaved(false);
    if (appPwNew !== appPwConfirm) {
      setAppPwError('New passwords do not match.');
      return;
    }
    setAppPwSaving(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'change',
          currentPassword: appPwCurrent,
          newPassword: appPwNew,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setAppPwError(json.error || 'Could not change password.');
        return;
      }
      setAppPwCurrent('');
      setAppPwNew('');
      setAppPwConfirm('');
      setAppPwSaved(true);
      setTimeout(() => setAppPwSaved(false), 2500);
    } catch {
      setAppPwError('Request failed. Try again.');
    } finally {
      setAppPwSaving(false);
    }
  };

  const handleChangeSettingsPassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSaved(false);
    if (pwNew !== pwConfirm) {
      setPwError('New passwords do not match.');
      return;
    }
    setPwSaving(true);
    try {
      const res = await fetch('/api/settings/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'change',
          currentPassword: pwCurrent,
          newPassword: pwNew,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setPwError(json.error || 'Could not change password.');
        return;
      }
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 2500);
    } catch {
      setPwError('Request failed. Try again.');
    } finally {
      setPwSaving(false);
    }
  };

  // Sync local form when settings load/change from the server.
  useEffect(() => {
    setForm(settings);
  }, [settings]);

  // Base balance protection: save immediately (no need to hit "Save Settings").
  const applyBaseBalance = async (value) => {
    const num = Number(value);
    const next = Number.isFinite(num) && num > 0 ? num : 0;
    const ok = await save({ ...form, baseBalance: next });
    if (ok) {
      setBaseDraft(null);
      setBaseFlash(next > 0 ? 'set' : 'off');
      setTimeout(() => setBaseFlash(null), 2500);
    }
  };

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

  if (authState === 'checking') {
    return <LoadingSpinner text="Checking access..." />;
  }

  if (authState === 'locked') {
    return <SettingsPasswordGate onUnlock={() => setAuthState('unlocked')} />;
  }

  if (loading) {
    return <LoadingSpinner text="Loading settings..." />;
  }

  // Derived, read-only account snapshot for context.
  const wallet = account?.totalWalletBalance || 0;
  const equity = Number(account?.totalMarginBalance) || 0; // wallet + unrealized PnL
  const openPositions = positions?.length || 0;
  const activeBase = Number(settings?.baseBalance) || 0;
  const baseBuffer = equity - activeBase;
  const baseInput = baseDraft ?? (activeBase > 0 ? String(activeBase) : '');
  const baseInputNum = Number(baseInput) || 0;
  const profitPct = Number(form.profitToBasePercent) || 0;
  const ratchet = settings?.baseBalanceRatchet || null;
  const ratchetIsToday = (() => {
    if (!ratchet?.day) return false;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return String(ratchet.day) === String(start.getTime());
  })();
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
    { id: 'security', label: '🔒 Security' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 md:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">⚙️ Settings</h1>
          <p className="text-gray-500 text-sm mt-1">
            Portfolio goals, risk defaults and display preferences.
          </p>
        </div>
        <button
          type="button"
          onClick={handleLockSettings}
          className="shrink-0 px-3 py-2 rounded-lg text-sm border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors"
        >
          Lock settings
        </button>
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
            checked={Number(form.requirePreOrderChecklist) !== 0}
            onChange={(e) => handleChange('requirePreOrderChecklist', e.target.checked ? 1 : 0)}
            className="mt-0.5 h-4 w-4 accent-orange-500"
          />
          <span>
            <span className="text-sm text-gray-200 font-medium">
              Pre-order checklist popup (New Order Buy/Sell)
            </span>
            <span className="block text-gray-500 text-xs mt-0.5">
              Shows the 5-point Yes/No confirmation before any futures market or limit order is sent.
              Save settings to apply.
            </span>
          </span>
        </label>

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

        {/* ── Base Balance Protection (balance floor) ─────────────────────── */}
        <div className={`mt-6 rounded-xl border p-4 ${
          activeBase > 0 ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-gray-700 bg-gray-900/40'
        }`}>
          <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="text-sm font-semibold text-white">🛡 Base Balance Protection</h3>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
              activeBase > 0
                ? 'text-emerald-300 border-emerald-500/50 bg-emerald-500/10'
                : 'text-gray-400 border-gray-600 bg-gray-800'
            }`}>
              {activeBase > 0 ? `ACTIVE · floor ${formatCurrency(activeBase)}` : 'OFF'}
            </span>
          </div>
          <p className="text-gray-500 text-xs mb-3">
            The balance you refuse to lose. While positions are open, if your overall balance
            (wallet + unrealized PnL) touches or drops to this value, <span className="text-red-300 font-semibold">
            every position is force-closed immediately — including 20x+ — with no confirmation</span>,
            well before liquidation. Example: positions running on $8,000, base balance $5,000 →
            the moment overall balance reaches $5,000 everything exits and $5,000 is protected.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
              <input
                type="number"
                min={0}
                step="50"
                placeholder="e.g. 5000"
                value={baseInput}
                onChange={(e) => setBaseDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyBaseBalance(baseInput); }}
                className="w-44 bg-gray-900 border border-gray-600 rounded-lg pl-7 pr-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 tabular-nums"
              />
            </div>
            <button
              type="button"
              onClick={() => applyBaseBalance(baseInput)}
              disabled={saving || !(baseInputNum > 0)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors"
            >
              {saving ? 'Saving…' : activeBase > 0 ? 'Update Base Balance' : 'Set Base Balance'}
            </button>
            {activeBase > 0 && (
              <button
                type="button"
                onClick={() => applyBaseBalance(0)}
                disabled={saving}
                className="px-3 py-2 rounded-lg text-sm border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Disable
              </button>
            )}
            {baseFlash === 'set' && <span className="text-emerald-400 text-sm">✓ Protection active</span>}
            {baseFlash === 'off' && <span className="text-gray-400 text-sm">Protection disabled</span>}
          </div>

          {/* Live context */}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-gray-900/70 border border-gray-700 p-2">
              <p className="text-gray-500">Overall balance now</p>
              <p className="text-white font-semibold tabular-nums">{formatCurrency(equity)}</p>
            </div>
            <div className="rounded-lg bg-gray-900/70 border border-gray-700 p-2">
              <p className="text-gray-500">Floor</p>
              <p className="text-emerald-300 font-semibold tabular-nums">
                {activeBase > 0 ? formatCurrency(activeBase) : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-gray-900/70 border border-gray-700 p-2 col-span-2 md:col-span-1">
              <p className="text-gray-500">Room before exit-all</p>
              <p className={`font-semibold tabular-nums ${
                activeBase <= 0 ? 'text-gray-400'
                  : baseBuffer <= 0 ? 'text-red-400'
                  : baseBuffer < activeBase * 0.1 ? 'text-yellow-300'
                  : 'text-green-400'
              }`}>
                {activeBase > 0 ? formatCurrency(baseBuffer) : '—'}
              </p>
            </div>
          </div>

          {equity > 0 && baseInputNum > 0 && baseInputNum >= equity && openPositions > 0 && (
            <p className="text-red-400 text-xs mt-2">
              ⚠ A floor at or above your current balance will exit all positions immediately.
            </p>
          )}

          {/* Grow the floor from banked profit */}
          <div className="mt-4 pt-4 border-t border-gray-700/60">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-200 font-medium">📈 Grow from profit:</span>
              <span className="text-sm text-gray-400">add</span>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="1"
                  value={form.profitToBasePercent ?? ''}
                  onChange={(e) => handleChange('profitToBasePercent', e.target.value)}
                  className="w-20 bg-gray-900 border border-gray-600 rounded-lg pl-3 pr-7 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500 tabular-nums"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
              </div>
              <span className="text-sm text-gray-400">of today&apos;s realized profit to the base balance</span>
              <button
                type="button"
                onClick={() => save({ ...form })}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
              >
                Save %
              </button>
            </div>
            <p className="text-gray-500 text-xs mt-1.5">
              {profitPct > 0 ? (
                <>
                  Example: base {formatCurrency(activeBase || 5000)} + $100 profit today →{' '}
                  <span className="text-emerald-300 font-semibold">
                    {formatCurrency((activeBase || 5000) + 100 * (profitPct / 100))}
                  </span>
                  . Each dollar of profit is counted once; a dip and recovery later in the day adds nothing
                  until PnL makes a new high. The floor only ever moves up from this.
                </>
              ) : (
                'Set to 0 to keep the base balance fixed.'
              )}
              {activeBase <= 0 && ' Applies only while protection is active.'}
            </p>
            {ratchet && ratchetIsToday && (Number(ratchet.addedToday) > 0 || Number(ratchet.creditedPnl) > 0) && (
              <p className="text-xs mt-1.5 text-gray-400">
                Today: profit credited{' '}
                <span className="text-white font-semibold tabular-nums">{formatCurrency(Number(ratchet.creditedPnl) || 0)}</span>
                {' '}→ added to base{' '}
                <span className="text-emerald-300 font-semibold tabular-nums">+{formatCurrency(Number(ratchet.addedToday) || 0)}</span>
                {ratchet.lastAddedAt && (
                  <span className="text-gray-600"> · last {new Date(ratchet.lastAddedAt).toLocaleTimeString()}</span>
                )}
              </p>
            )}
          </div>
          <p className="text-gray-600 text-[11px] mt-2">
            Enforced live on the Futures page and 24/7 by the server watcher (<code>npm run watcher</code>) when it is running.
          </p>
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
        <label className="flex items-start gap-3 cursor-pointer mt-5 mb-4">
          <input
            type="checkbox"
            checked={Number(form.autoDailyGoalSync) !== 0}
            onChange={(e) => handleChange('autoDailyGoalSync', e.target.checked ? 1 : 0)}
            className="mt-0.5 h-4 w-4 accent-green-500"
          />
          <span>
            <span className="text-sm text-gray-200 font-medium">
              Auto mark compound goal from today&apos;s profit
            </span>
            <span className="block text-gray-500 text-xs mt-0.5">
              When today&apos;s net PnL (realized + open positions) reaches{' '}
              {form.compoundPercent}% of wallet, the next milestone is marked complete automatically.
              If profit drops back below that target, only the auto-mark is undone.
            </span>
          </span>
        </label>

        <div className="mt-2 rounded-lg bg-gray-900/70 border border-gray-700 p-3 text-xs text-gray-400 space-y-1">
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

      {activeSection === 'security' && (
      <section className="bg-gray-800/50 rounded-xl border border-gray-700 p-4 md:p-6 space-y-10">
        <div>
          <h2 className="text-lg font-semibold text-white mb-2">App login password</h2>
          <p className="text-gray-500 text-sm mb-5">
            Used to sign in to the whole dashboard (7-day session). Separate from the settings page password.
          </p>
          <form onSubmit={handleChangeAppPassword} className="max-w-md space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Current app password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={appPwCurrent}
                onChange={(e) => setAppPwCurrent(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">New app password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={appPwNew}
                onChange={(e) => setAppPwNew(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Confirm new app password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={appPwConfirm}
                onChange={(e) => setAppPwConfirm(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            {appPwError && <p className="text-red-400 text-sm">{appPwError}</p>}
            {appPwSaved && <p className="text-green-400 text-sm">App password updated.</p>}
            <button
              type="submit"
              disabled={appPwSaving || !appPwCurrent || !appPwNew || !appPwConfirm}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
            >
              {appPwSaving ? 'Saving…' : 'Update app password'}
            </button>
          </form>
        </div>

        <div className="border-t border-gray-700 pt-8">
        <h2 className="text-lg font-semibold text-white mb-2">Settings page password</h2>
        <p className="text-gray-500 text-sm mb-5">
          Extra lock for this settings area only (12-hour session after unlock).
        </p>
        <form onSubmit={handleChangeSettingsPassword} className="max-w-md space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Current password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Confirm new password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          {pwError && <p className="text-red-400 text-sm">{pwError}</p>}
          {pwSaved && <p className="text-green-400 text-sm">Password updated.</p>}
          <button
            type="submit"
            disabled={pwSaving || !pwCurrent || !pwNew || !pwConfirm}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
          >
            {pwSaving ? 'Saving…' : 'Update settings password'}
          </button>
        </form>
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
