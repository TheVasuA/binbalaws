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
let _alarmEl = null;      // the shared <audio> element (loops natively)
let _unlocked = false;    // becomes true after the first user gesture
let _audioCtx = null;     // single persistent Web Audio context (synth fallback)
let _loopTimer = null;    // setInterval handle for the synth-beep loop
let _stopTimer = null;    // setTimeout handle that ends the whole alarm
let _alarmActive = false; // true while the 15-min alarm is sounding

function getAlarmEl() {
  if (typeof window === 'undefined') return null;
  if (_alarmEl) return _alarmEl;
  const el = new Audio(ALARM_SRC);
  el.preload = 'auto';
  el.loop = true; // loop the clip continuously while the alarm is active
  _alarmEl = el;
  return el;
}

// One shared AudioContext reused for every synth beep. Creating a fresh context
// per beep was the bug behind "only a single beep" — new contexts start
// suspended under the autoplay policy, so later beeps were silent.
function getAudioCtx() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!_audioCtx) {
    try { _audioCtx = new Ctx(); } catch { return null; }
  }
  if (_audioCtx.state === 'suspended') { _audioCtx.resume().catch(() => {}); }
  return _audioCtx;
}

// Synthetic beep burst using the shared, resumed context.
function synthBeep({ times = 3, freq = 880, gap = 220 } = {}) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    let t = ctx.currentTime;
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
      t += gap / 1000;
    }
  } catch { /* audio not available */ }
}

// A single beep burst (used by notify beep:true) — primary file else synth.
function playBeep(opts = {}) {
  // If the continuous alarm is already sounding, don't touch the looping audio
  // element (that would stop the loop) — just add a synth beep on top.
  if (_alarmActive) { synthBeep(opts); return; }
  const el = getAlarmEl();
  if (el) {
    try {
      el.loop = false; // one-shot for a plain notification beep
      el.currentTime = 0;
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => synthBeep(opts));
      return;
    } catch { /* fall through to synth */ }
  }
  synthBeep(opts);
}

// Unlock audio on the first user gesture so later programmatic plays are
// allowed by the browser's autoplay policy.
function installAudioUnlock() {
  if (typeof window === 'undefined' || _unlocked) return;
  const unlock = () => {
    _unlocked = true;
    // Resume/prime the Web Audio context so synth beeps work later.
    getAudioCtx();
    const el = getAlarmEl();
    if (el) {
      const prevMuted = el.muted;
      const prevLoop = el.loop;
      el.muted = true;
      el.loop = false;
      const p = el.play();
      const done = () => { el.pause(); el.currentTime = 0; el.muted = prevMuted; el.loop = prevLoop; };
      if (p && typeof p.then === 'function') p.then(done).catch(done);
      else done();
    }
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

// Start a CONTINUOUS alarm for `durationMs` (default 15 minutes). The audio file
// loops natively (reliable, unlike re-triggering it every few seconds, which
// browsers drop); a synth beep loop runs in parallel as a guaranteed fallback.
// Calling again just refreshes the duration without restarting the sound.
function startAlarmLoop({ durationMs = 15 * 60 * 1000, everyMs = 3000, opts } = {}) {
  if (typeof window === 'undefined') return;

  // (Re)schedule the overall stop time.
  if (_stopTimer) { clearTimeout(_stopTimer); _stopTimer = null; }
  _stopTimer = setTimeout(() => stopAlarmLoop(), durationMs);

  if (_alarmActive) return; // already sounding; duration just extended above
  _alarmActive = true;

  // Primary: loop the real alarm file continuously.
  const el = getAlarmEl();
  if (el) {
    try {
      el.loop = true;
      el.currentTime = 0;
      const p = el.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* rely on synth loop */ });
    } catch { /* rely on synth loop */ }
  }

  // Synth beep loop — runs in parallel so there is always an audible, repeating
  // alarm even if the file is blocked/unsupported. Fires now, then every everyMs.
  const beepOpts = opts || { times: 3, freq: 740, gap: 200 };
  synthBeep(beepOpts);
  if (!_loopTimer) {
    _loopTimer = setInterval(() => synthBeep(beepOpts), everyMs);
  }
}

function stopAlarmLoop() {
  _alarmActive = false;
  if (_loopTimer) { clearInterval(_loopTimer); _loopTimer = null; }
  if (_stopTimer) { clearTimeout(_stopTimer); _stopTimer = null; }
  if (_alarmEl) { try { _alarmEl.pause(); _alarmEl.loop = false; _alarmEl.currentTime = 0; } catch { /* ignore */ } }
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
