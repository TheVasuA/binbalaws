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
let _unlocked = false;    // becomes true after the first user gesture
let _audioCtx = null;     // single persistent Web Audio context
let _loopTimer = null;    // setInterval handle for the repeating alarm
let _stopTimer = null;    // setTimeout handle that ends the whole alarm
let _alarmActive = false; // true while the alarm is sounding
const _alarmListeners = new Set(); // UI subscribers notified on alarm start/stop
let _selectedTone = 'classic'; // current alarm tone id (set from settings)

// Notify UI subscribers whenever the alarm turns on/off.
function emitAlarmActive(v) {
  _alarmActive = v;
  _alarmListeners.forEach((fn) => { try { fn(v); } catch { /* ignore */ } });
}

// Subscribe to alarm on/off state changes (used by the Stop-Alarm button).
export function onAlarmActive(fn) {
  _alarmListeners.add(fn);
  return () => { _alarmListeners.delete(fn); };
}
export function isAlarmActive() { return _alarmActive; }

// ── 10 selectable alarm tones ───────────────────────────────────────────────
// Each tone is a short pattern of notes played via Web Audio (no files needed,
// works offline). A pattern is an array of { freq, dur } notes; `type` is the
// oscillator waveform. The alarm loop repeats the chosen pattern.
export const ALARM_TONES = [
  { id: 'classic',   name: 'Classic Beep',    type: 'square',   pattern: [{ f: 880, d: 0.15 }, { f: 880, d: 0.15 }, { f: 880, d: 0.15 }] },
  { id: 'siren',     name: 'Siren',           type: 'sine',     pattern: [{ f: 600, d: 0.25 }, { f: 900, d: 0.25 }, { f: 600, d: 0.25 }, { f: 900, d: 0.25 }] },
  { id: 'chime',     name: 'Chime',           type: 'sine',     pattern: [{ f: 1047, d: 0.18 }, { f: 1319, d: 0.18 }, { f: 1568, d: 0.3 }] },
  { id: 'pulse',     name: 'Fast Pulse',      type: 'square',   pattern: [{ f: 1000, d: 0.08 }, { f: 0, d: 0.06 }, { f: 1000, d: 0.08 }, { f: 0, d: 0.06 }, { f: 1000, d: 0.08 }] },
  { id: 'alert',     name: 'Alert',           type: 'sawtooth', pattern: [{ f: 440, d: 0.2 }, { f: 880, d: 0.2 }] },
  { id: 'warble',    name: 'Warble',          type: 'triangle', pattern: [{ f: 700, d: 0.1 }, { f: 1100, d: 0.1 }, { f: 700, d: 0.1 }, { f: 1100, d: 0.1 }] },
  { id: 'descending',name: 'Descending',      type: 'square',   pattern: [{ f: 1200, d: 0.12 }, { f: 900, d: 0.12 }, { f: 600, d: 0.2 }] },
  { id: 'ascending', name: 'Ascending',       type: 'square',   pattern: [{ f: 600, d: 0.12 }, { f: 900, d: 0.12 }, { f: 1200, d: 0.2 }] },
  { id: 'doublebeep',name: 'Double Beep',     type: 'square',   pattern: [{ f: 988, d: 0.12 }, { f: 988, d: 0.12 }, { f: 0, d: 0.2 }] },
  { id: 'buzzer',    name: 'Harsh Buzzer',    type: 'sawtooth', pattern: [{ f: 220, d: 0.4 }] },
];

const TONE_BY_ID = Object.fromEntries(ALARM_TONES.map((t) => [t.id, t]));

export function setAlarmTone(id) {
  if (TONE_BY_ID[id]) _selectedTone = id;
}

// One shared AudioContext reused for every beep. Creating a fresh context per
// beep was the bug behind "only a single beep" — new contexts start suspended
// under the autoplay policy, so later beeps were silent.
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

// Play one cycle of a tone pattern. `toneId` defaults to the selected tone.
function playTone(toneId) {
  const tone = TONE_BY_ID[toneId] || TONE_BY_ID[_selectedTone] || ALARM_TONES[0];
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    let t = ctx.currentTime;
    for (const note of tone.pattern) {
      const dur = Number(note.d) || 0.15;
      if (note.f > 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = tone.type || 'square';
        osc.frequency.value = note.f;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
      t += dur;
    }
  } catch { /* audio not available */ }
}

// Public: preview a tone once (used by the Settings picker).
export function previewAlarmTone(toneId) {
  getAudioCtx();
  playTone(toneId);
}

// A single beep burst (used by notify beep:true) — plays the current tone once.
function playBeep() {
  playTone(_selectedTone);
}

// Unlock audio on the first user gesture so later programmatic plays are
// allowed by the browser's autoplay policy.
function installAudioUnlock() {
  if (typeof window === 'undefined' || _unlocked) return;
  const unlock = () => {
    _unlocked = true;
    getAudioCtx(); // resume/prime the Web Audio context for later beeps
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

// Start a CONTINUOUS alarm for `durationMs` (default 15 minutes): it repeats the
// selected tone every `everyMs` for the whole duration. Calling again just
// refreshes the duration without restarting. Pass { toneId } to override the
// currently selected tone for this alarm.
function startAlarmLoop({ durationMs = 15 * 60 * 1000, everyMs = 3000, toneId } = {}) {
  if (typeof window === 'undefined') return;
  const tone = toneId || _selectedTone;

  // (Re)schedule the overall stop time.
  if (_stopTimer) { clearTimeout(_stopTimer); _stopTimer = null; }
  _stopTimer = setTimeout(() => stopAlarmLoop(), durationMs);

  if (_alarmActive) return; // already sounding; duration just extended above
  _alarmActive = true;
  emitAlarmActive(true);

  // Repeat the chosen tone for the whole duration — fires now, then every everyMs.
  playTone(tone);
  if (!_loopTimer) {
    _loopTimer = setInterval(() => playTone(tone), everyMs);
  }
}

function stopAlarmLoop() {
  _alarmActive = false;
  emitAlarmActive(false);
  if (_loopTimer) { clearInterval(_loopTimer); _loopTimer = null; }
  if (_stopTimer) { clearTimeout(_stopTimer); _stopTimer = null; }
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
    ({ title, message, level = 'info', beep = false, duration = 5000, sticky = false } = {}) => {
      const id = nextId();
      setToasts((prev) => [...prev, { id, title, message, level }]);
      if (beep) playBeep();
      // Every notification auto-hides after `duration` ms (default 5s) so the
      // stack never piles up — even "sticky" ones dismiss on the timer.
      timers.current[id] = setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  // Start/stop the repeating alarm (used for the 15-minute base-balance alert).
  const startAlarm = useCallback((o) => startAlarmLoop(o), []);
  const stopAlarm = useCallback(() => stopAlarmLoop(), []);

  // Track whether the alarm is currently sounding so we can show a Stop button.
  const [alarmActive, setAlarmActive] = useState(false);
  useEffect(() => onAlarmActive(setAlarmActive), []);

  useEffect(() => {
    const t = timers.current;
    return () => { Object.values(t).forEach(clearTimeout); stopAlarmLoop(); };
  }, []);

  return (
    <NotifyContext.Provider value={{ notify, dismiss, startAlarm, stopAlarm }}>
      {children}
      {/* Floating "Stop alarm" button — shown only while the alarm is ringing */}
      {alarmActive && (
        <button
          onClick={() => stopAlarm()}
          className="fixed left-4 bottom-20 z-[101] flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold shadow-2xl border border-red-400/50 animate-pulse"
          title="Stop the alarm sound"
        >
          <span className="text-lg">🔇</span> Stop Alarm
        </button>
      )}
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
    <div className="fixed bottom-4 left-4 z-[100] flex flex-col gap-2 w-[92%] max-w-sm pointer-events-none">
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
