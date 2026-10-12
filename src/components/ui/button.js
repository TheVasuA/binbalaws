import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Spinner } from './feedback';

const VARIANTS = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'bg-surface-2 text-fg border border-line hover:bg-surface-3 hover:border-line-strong',
  ghost: 'text-fg-muted hover:text-fg hover:bg-surface-3',
  danger: 'bg-neg text-white hover:brightness-110',
  'danger-soft': 'text-neg bg-neg/10 border border-neg/25 hover:bg-neg/15',
  buy: 'bg-pos text-white hover:brightness-110',
  sell: 'bg-neg text-white hover:brightness-110',
};

const SIZES = {
  xs: 'h-7 px-2 text-xs gap-1.5',
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-4 text-sm gap-2',
  icon: 'h-8 w-8 justify-center',
  'icon-sm': 'h-7 w-7 justify-center',
};

export function buttonClasses({ variant = 'secondary', size = 'md', block = false, className } = {}) {
  return cn(
    'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap select-none',
    'transition-[background-color,border-color,color,filter] duration-150',
    'disabled:opacity-50 disabled:pointer-events-none',
    VARIANTS[variant],
    SIZES[size],
    block && 'w-full',
    className,
  );
}

export function Button({
  variant,
  size,
  block,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, block, className })}
      {...props}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, block, className, ...props }) {
  return <Link className={buttonClasses({ variant, size, block, className })} {...props} />;
}
