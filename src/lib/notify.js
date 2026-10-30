'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const NotifyContext = createContext(null);

let _id = 0;
const nextId = () => ++_id;

// ── Alarm sound ─────────────────────────────────────────────────────────────
// Primary: a real alarm sound file (public-domain beep, shipped in /public —
// originally sourced from the net). Browsers block audio until the user has
// interacted with the page, so we "unlock" the element on the first gesture.
// If the file can't load/play (e.g. Safari + ogg, or a fetch error), we fall
// back to a synthetic Web Audio beep so the alarm is never silent.
const ALARM_SRC = '/alarm.ogg';
let _alarmEl = null;      // the shared <audio> element
let _unlocked = false;    // becomes true after the first user gesture
let _loopTimer = null;    // setInterval handle for the repeating alarm
let _loopStopAt = 0;      // timestamp when the repeating alarm should stop

function getAlarmEl() {
  if (typeof window === 'undefined') return null;
  if (_alarmEl) return _alarmEl;
  const el = new Audio(ALARM_SRC);
  el.preload = 'auto';
  _alarmEl = el;
  return el;
}

// Synthetic fallback beep (no file needed).
function synthBeep({ times = 3, freq = 880, gap = 220 } = {}) {
  if (typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    let t = ctx.currentTime;
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
      t += gap / 1000;
    }
    setTimeout(() => ctx.close().catch(() => {}), times * gap + 400);
  } catch { /* audio not available */ }
}

// Play the alarm file once; fall back to the synth beep on any failure.
function playOnce(opts) {
  const el = getAlarmEl();
  if (!el) { synthBeep(opts); return; }
  try {
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => synthBeep(opts)); // blocked or failed → fallback
    }
  } catch {
    synthBeep(opts);
  }
}

function playBeep(opts = {}) {
  playOnce(opts);
}

// Unlock audio on the first user gesture so later programmatic plays are
// allowed by the browser's autoplay policy.
function installAudioUnlock() {
  if (typeof window === 'undefined' || _unlocked) return;
  const unlock = () => {
    _unlocked = true;
    const el = getAlarmEl();
    if (el) {
      // Prime the element: play muted then immediately pause/reset.
      const prevMuted = el.muted;
      el.muted = true;
      const p = el.play();
      const done = () => { el.pause(); el.currentTime = 0; el.muted = prevMuted; };
      if (p && typeof p.then === 'function') p.then(done).catch(done);
      else done();
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

// Start a repeating alarm that beeps every `everyMs` for up to `durationMs`
// (default 15 minutes). Idempotent: calling again just extends/refreshes it.
function startAlarmLoop({ durationMs = 15 * 60 * 1000, everyMs = 3000, opts } = {}) {
  if (typeof window === 'undefined') return;
  _loopStopAt = Date.now() + durationMs;
  playOnce(opts);
  if (_loopTimer) return; // already looping; _loopStopAt was refreshed above
  _loopTimer = setInterval(() => {
    if (Date.now() >= _loopStopAt) { stopAlarmLoop(); return; }
    playOnce(opts);
  }, everyMs);
}

function stopAlarmLoop() {
  if (_loopTimer) { clearInterval(_loopTimer); _loopTimer = null; }
  _loopStopAt = 0;
  if (_alarmEl) { try { _alarmEl.pause(); _alarmEl.currentTime = 0; } catch { /* ignore */ } }
}

/**
 * NotificationProvider — renders a bottom toast stack and exposes notify().
 * Wrap the dashboard layout with it.
 */
export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  // Enable audio playback after the first click/keypress (browser autoplay rule).
  useEffect(() => { installAudioUnlock(); }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const notify = useCallback(
    ({ title, message, level = 'info', beep = false, duration = 6000, sticky = false }) => {
      const id = nextId();
      setToasts((prev) => [...prev, { id, title, message, level }]);
      if (beep) playBeep(level === 'danger' ? { times: 4, freq: 660 } : { times: 2 });
      if (!sticky) {
        timers.current[id] = setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss],
  );

  // Start/stop the repeating alarm (used for the 15-minute base-balance alert).
  const startAlarm = useCallback((o) => startAlarmLoop(o), []);
  const stopAlarm = useCallback(() => stopAlarmLoop(), []);

  useEffect(() => {
    const t = timers.current;
    return () => { Object.values(t).forEach(clearTimeout); stopAlarmLoop(); };
  }, []);

  return (
    <NotifyContext.Provider value={{ notify, dismiss, startAlarm, stopAlarm }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </NotifyContext.Provider>
  );
}

export function useNotify() {
  const ctx = useContext(NotifyContext);
  // Fallback no-op if used outside the provider.
  return ctx || { notify: () => {}, dismiss: () => {}, startAlarm: () => {}, stopAlarm: () => {} };
}

// ── Toast stack UI (bottom of page) ─────────────────────────────────────────
const LEVEL_STYLES = {
  info: 'bg-gray-800 border-blue-500/40 text-blue-200',
  success: 'bg-gray-800 border-green-500/40 text-green-200',
  warning: 'bg-gray-800 border-yellow-500/50 text-yellow-200',
  danger: 'bg-gray-900 border-red-500/60 text-red-200',
};
const LEVEL_ICON = { info: 'ℹ️', success: '✅', warning: '⚠️', danger: '🛑' };

function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[92%] max-w-md pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2 shadow-2xl backdrop-blur-md animate-fadeIn ${
            LEVEL_STYLES[t.level] || LEVEL_STYLES.info
          } ${t.level === 'danger' ? 'animate-pulse' : ''}`}
        >
          <span className="text-lg leading-none mt-0.5">{LEVEL_ICON[t.level] || 'ℹ️'}</span>
          <div className="flex-1 min-w-0">
            {t.title && <p className="text-sm font-semibold text-white">{t.title}</p>}
            {t.message && <p className="text-xs opacity-90 break-words">{t.message}</p>}
          </div>
          <button
            onClick={() => onDismiss(t.id)}
            className="text-gray-400 hover:text-white text-lg leading-none ml-1"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
