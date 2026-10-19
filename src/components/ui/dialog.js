'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { IconAlert, IconX } from './icons';

export function Dialog({ open, onClose, title, description, children, footer, size = 'sm', dismissible = true }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    const focusable = panel?.querySelector('[data-autofocus]') || panel?.querySelector('input, select, textarea, button');
    focusable?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = original;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  const width = size === 'lg' ? 'max-w-2xl' : size === 'md' ? 'max-w-lg' : 'max-w-md';

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
        onClick={dismissible ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn('animate-dialog-in relative w-full rounded-lg bg-surface shadow-pop', width)}
      >
        {(title || dismissible) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-4">
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>}
              {description && <p className="mt-1 text-[13px] text-fg-muted">{description}</p>}
            </div>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1.5 rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg"
              >
                <IconX size={16} />
              </button>
            )}
          </div>
        )}
        {children && <div className="px-5 pt-4">{children}</div>}
        <div className="flex justify-end gap-2 px-5 pb-4 pt-5">{footer}</div>
      </div>
    </div>
  );
}

// ── Promise-based confirmation ──────────────────────────────────────────────
// `const confirm = useConfirm(); if (!(await confirm({...}))) return;`

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState(options);
    });
  }, []);

  const settle = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setState(null);
  }, []);

  const cancel = useCallback(() => settle(false), [settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={!!state}
        onClose={cancel}
        title={
          state?.tone === 'danger' ? (
            <span className="flex items-center gap-2">
              <IconAlert size={16} className="text-neg" />
              {state?.title}
            </span>
          ) : (
            state?.title
          )
        }
        description={state?.description}
        footer={
          <>
            <Button variant="secondary" onClick={cancel} data-autofocus={state?.tone === 'danger' || undefined}>
              {state?.cancelLabel || 'Cancel'}
            </Button>
            <Button
              data-autofocus={state?.tone !== 'danger' || undefined}
              variant={state?.tone === 'danger' ? 'danger' : 'primary'}
              onClick={() => settle(true)}
            >
              {state?.confirmLabel || 'Confirm'}
            </Button>
          </>
        }
      >
        {state?.body}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  return ctx || (async (opts) => window.confirm(opts?.title || 'Are you sure?'));
}
