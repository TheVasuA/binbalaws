'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const NotifyContext = createContext(null);

let _id = 0;
const nextId = () => ++_id;

// ── Alarm beep via Web Audio API (no external file, works offline) ──────────
function playBeep({ times = 3, freq = 880, gap = 220 } = {}) {
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
    // Close context after the last beep to free resources.
    setTimeout(() => ctx.close().catch(() => {}), times * gap + 400);
  } catch { /* audio not available */ }
}

/**
 * NotificationProvider — renders a bottom toast stack and exposes notify().
 * Wrap the dashboard layout with it.
 */
export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

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

  useEffect(() => {
    const t = timers.current;
    return () => { Object.values(t).forEach(clearTimeout); };
  }, []);

  return (
    <NotifyContext.Provider value={{ notify, dismiss }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </NotifyContext.Provider>
  );
}

export function useNotify() {
  const ctx = useContext(NotifyContext);
  // Fallback no-op if used outside the provider.
  return ctx || { notify: () => {}, dismiss: () => {} };
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
