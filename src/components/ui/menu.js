'use client';

import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

const MenuContext = createContext(null);

/**
 * Dropdown menu. `trigger` is a render function receiving button props so the
 * caller keeps full control of the trigger's look.
 */
export function Menu({ trigger, children, align = 'end', width = 'w-56', className }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      {trigger({
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': id,
        onClick: () => setOpen((v) => !v),
      })}
      {open && (
        <div
          id={id}
          role="menu"
          className={cn(
            'animate-dialog-in absolute z-[60] mt-1.5 rounded-md bg-surface p-1 shadow-pop',
            align === 'end' ? 'right-0' : 'left-0',
            width,
          )}
        >
          <MenuContext.Provider value={() => setOpen(false)}>{children}</MenuContext.Provider>
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon: Icon, tone, description, onSelect, disabled, children }) {
  const close = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        close?.();
        onSelect?.();
      }}
      className={cn(
        'flex w-full items-start gap-2.5 rounded px-2.5 py-2 text-left text-[13px] transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        tone === 'danger' ? 'text-neg hover:bg-neg/10' : 'text-fg hover:bg-surface-3',
      )}
    >
      {Icon && <Icon size={15} className="mt-0.5 shrink-0" />}
      <span className="min-w-0">
        <span className="block font-medium">{children}</span>
        {description && <span className="mt-0.5 block text-xs text-fg-muted">{description}</span>}
      </span>
    </button>
  );
}

export function MenuSeparator() {
  return <div className="-mx-1 my-1 h-px bg-line" role="separator" />;
}

export function MenuLabel({ children }) {
  return <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">{children}</div>;
}
