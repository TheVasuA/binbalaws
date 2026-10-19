'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded-md border border-line bg-surface-2 text-sm text-fg placeholder:text-fg-subtle ' +
  'transition-[border-color,box-shadow] duration-150 outline-none ' +
  'hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/20 ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export function Label({ htmlFor, children, className, aside }) {
  return (
    <div className={cn('mb-1.5 flex items-center justify-between gap-2', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-fg-muted">
        {children}
      </label>
      {aside && <div className="text-xs text-fg-subtle">{aside}</div>}
    </div>
  );
}

/** Label + control + hint/error, wiring ids for accessibility. */
export function Field({ label, aside, hint, error, children, className }) {
  const id = useId();
  const control = typeof children === 'function' ? children(id) : children;
  return (
    <div className={className}>
      {label && <Label htmlFor={id} aside={aside}>{label}</Label>}
      {control}
      {error ? (
        <p className="mt-1.5 text-xs text-neg">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-fg-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, prefix, suffix, size = 'md', ...props }) {
  const height = size === 'sm' ? 'h-8' : size === 'lg' ? 'h-11' : 'h-9';
  if (!prefix && !suffix) {
    return <input className={cn(CONTROL, height, 'px-3', className)} {...props} />;
  }
  return (
    <div className={cn('relative flex items-center', className)}>
      {prefix && <span className="pointer-events-none absolute left-3 text-xs text-fg-subtle">{prefix}</span>}
      <input
        className={cn(CONTROL, height, prefix ? 'pl-8' : 'pl-3', suffix ? 'pr-14' : 'pr-3')}
        {...props}
      />
      {suffix && <span className="pointer-events-none absolute right-3 text-xs text-fg-subtle">{suffix}</span>}
    </div>
  );
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn(CONTROL, 'min-h-20 px-3 py-2', className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn(CONTROL, 'h-9 appearance-none bg-no-repeat pl-3 pr-8', className)} style={{ backgroundImage: 'none' }} {...props}>
      {children}
    </select>
  );
}

export function Switch({ checked, onChange, disabled, label, description, tone = 'accent', id: idProp }) {
  const autoId = useId();
  const id = idProp || autoId;
  const on = tone === 'neg' ? 'bg-neg' : tone === 'pos' ? 'bg-pos' : 'bg-accent';
  const control = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={!!checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? on : 'bg-line-strong',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
  if (!label) return control;
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-fg-muted">{description}</span>}
      </label>
      <div className="pt-0.5">{control}</div>
    </div>
  );
}

const SEG_ACTIVE = {
  default: 'bg-surface text-fg shadow-sm ring-1 ring-line-strong',
  accent: 'bg-accent text-accent-fg',
  pos: 'bg-pos text-white',
  neg: 'bg-neg text-white',
};

/**
 * Segmented control. `options` = [{ value, label, tone? }]. With `block`, the
 * segments share the full width equally.
 */
export function Segmented({ options, value, onChange, size = 'sm', block = false, className, ariaLabel }) {
  const h = size === 'xs' ? 'h-6 text-[11px] px-2' : size === 'md' ? 'h-9 text-sm px-3' : 'h-7 text-xs px-2.5';
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex gap-0.5 rounded-md border border-line bg-surface-2 p-0.5',
        block && 'flex w-full',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded font-medium transition-colors duration-150',
              'disabled:cursor-not-allowed disabled:opacity-40',
              h,
              block && 'flex-1',
              active ? SEG_ACTIVE[opt.tone || 'default'] : 'text-fg-muted hover:text-fg',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** Row of quick-pick chips (e.g. 25% / 50% / 75% / 100%). */
export function ChipRow({ options, value, onSelect, className, disabled }) {
  return (
    <div className={cn('grid gap-1.5', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((opt) => {
        const active = value !== undefined && String(opt.value) === String(value);
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(opt.value)}
            className={cn(
              'num h-7 rounded-md border text-xs font-medium transition-colors duration-150',
              'disabled:cursor-not-allowed disabled:opacity-40',
              active
                ? 'border-accent/60 bg-accent/10 text-accent'
                : 'border-line bg-surface-2 text-fg-muted hover:border-line-strong hover:text-fg',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
