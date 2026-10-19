'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { IconAlert, IconCheckCircle, IconInfo, IconX, IconXCircle } from '@/components/ui/icons';

const NotifyContext = createContext(null);

let lastId = 0;
const nextId = () => ++lastId;

/** How long the post-order alert beeps (unless dismissed early). */
export const ORDER_ALERT_DURATION_MS = 2 * 60 * 1000;
const ORDER_BEEP_INTERVAL_MS = 2800;

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
  const [orderAlert, setOrderAlert] = useState(null);
  const timers = useRef({});
  const orderAlertTimers = useRef({ beep: null, end: null });

  const stopOrderAlert = useCallback(() => {
    if (orderAlertTimers.current.beep) {
      clearInterval(orderAlertTimers.current.beep);
      orderAlertTimers.current.beep = null;
    }
    if (orderAlertTimers.current.end) {
      clearTimeout(orderAlertTimers.current.end);
      orderAlertTimers.current.end = null;
    }
    setOrderAlert(null);
  }, []);

  /** After a successful new order: beep every ~2.8s for up to 2 minutes, with a Close control. */
  const startOrderAlert = useCallback(({ title, message }) => {
    stopOrderAlert();
    setOrderAlert({
      title: title || 'Order placed',
      message: message || '',
      startedAt: Date.now(),
    });
    const beepOnce = () => playBeep({ times: 3, freq: 920, gap: 180 });
    beepOnce();
    orderAlertTimers.current.beep = setInterval(beepOnce, ORDER_BEEP_INTERVAL_MS);
    orderAlertTimers.current.end = setTimeout(stopOrderAlert, ORDER_ALERT_DURATION_MS);
  }, [stopOrderAlert]);

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
    return () => {
      Object.values(t).forEach(clearTimeout);
      stopOrderAlert();
    };
  }, [stopOrderAlert]);

  return (
    <NotifyContext.Provider value={{ notify, dismiss, startOrderAlert, stopOrderAlert }}>
      {children}
      {orderAlert && (
        <OrderAlertBanner alert={orderAlert} onClose={stopOrderAlert} />
      )}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </NotifyContext.Provider>
  );
}

export function useNotify() {
  const ctx = useContext(NotifyContext);
  return ctx || {
    notify: () => {},
    dismiss: () => {},
    startOrderAlert: () => {},
    stopOrderAlert: () => {},
  };
}

function OrderAlertBanner({ alert, onClose }) {
  return (
    <div
      className="fixed top-20 left-1/2 -translate-x-1/2 z-[110] w-[92%] max-w-lg pointer-events-auto"
      role="alertdialog"
      aria-labelledby="order-alert-title"
    >
      <div className="rounded-xl border-2 border-green-500/70 bg-gray-900/95 backdrop-blur-md shadow-2xl p-4 animate-pulse">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none" aria-hidden>🔔</span>
          <div className="flex-1 min-w-0">
            <p id="order-alert-title" className="text-base font-bold text-green-300">
              {alert.title}
            </p>
            {alert.message && (
              <p className="text-sm text-gray-200 mt-1 break-words">{alert.message}</p>
            )}
            <p className="text-[11px] text-gray-500 mt-2">
              Alert sound repeats for up to 2 minutes. Tap Close to stop immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
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
