'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { IconAlert, IconCheckCircle, IconInfo, IconX, IconXCircle } from '@/components/ui/icons';

const NotifyContext = createContext(null);

let lastId = 0;
const nextId = () => ++lastId;

// Alarm beep via the Web Audio API (no asset to load, works offline).
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
    setTimeout(() => ctx.close().catch(() => {}), times * gap + 400);
  } catch { /* audio unavailable */ }
}

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
      setToasts((prev) => [...prev.slice(-4), { id, title, message, level }]);
      if (beep) playBeep(level === 'danger' ? { times: 4, freq: 660 } : { times: 2 });
      if (!sticky) timers.current[id] = setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
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
  return ctx || { notify: () => {}, dismiss: () => {} };
}

const LEVELS = {
  info: { icon: IconInfo, accent: 'text-accent', bar: 'bg-accent' },
  success: { icon: IconCheckCircle, accent: 'text-pos', bar: 'bg-pos' },
  warning: { icon: IconAlert, accent: 'text-warn', bar: 'bg-warn' },
  danger: { icon: IconXCircle, accent: 'text-neg', bar: 'bg-neg' },
};

function ToastStack({ toasts, onDismiss }) {
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const level = LEVELS[t.level] || LEVELS.info;
        const Icon = level.icon;
        return (
          <div
            key={t.id}
            role={t.level === 'danger' ? 'alert' : 'status'}
            className="animate-toast-in pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-lg bg-surface py-3 pl-4 pr-3 shadow-pop"
          >
            <span className={cn('absolute inset-y-0 left-0 w-0.5', level.bar)} />
            <Icon size={16} className={cn('mt-0.5 shrink-0', level.accent)} />
            <div className="min-w-0 flex-1">
              {t.title && <p className="text-[13px] font-medium text-fg">{t.title}</p>}
              {t.message && <p className="mt-0.5 break-words text-xs text-fg-muted">{t.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="rounded p-0.5 text-fg-subtle hover:bg-surface-3 hover:text-fg"
              aria-label="Dismiss"
            >
              <IconX size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
