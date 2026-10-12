import { cn } from '@/lib/cn';
import { IconAlert, IconCheckCircle, IconInfo, IconXCircle } from './icons';

export function Spinner({ size = 16, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin', className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-3', className)} />;
}

export function PageLoader({ label = 'Loading' }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-2.5 text-sm text-fg-muted">
      <Spinner />
      {label}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {Icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-subtle">
          <Icon size={18} />
        </div>
      )}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-fg-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const CALLOUT_TONES = {
  info: { cls: 'border-accent/30 bg-accent/8 text-fg', icon: IconInfo, iconCls: 'text-accent' },
  success: { cls: 'border-pos/30 bg-pos/8 text-fg', icon: IconCheckCircle, iconCls: 'text-pos' },
  warn: { cls: 'border-warn/35 bg-warn/8 text-fg', icon: IconAlert, iconCls: 'text-warn' },
  danger: { cls: 'border-neg/35 bg-neg/8 text-fg', icon: IconXCircle, iconCls: 'text-neg' },
};

export function Callout({ tone = 'info', title, children, action, className }) {
  const t = CALLOUT_TONES[tone] || CALLOUT_TONES.info;
  const Icon = t.icon;
  return (
    <div className={cn('flex items-start gap-3 rounded-md border px-3.5 py-3 text-[13px]', t.cls, className)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={16} className={cn('mt-0.5 shrink-0', t.iconCls)} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn('break-words text-fg-muted', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const PROGRESS_TONES = {
  accent: 'bg-accent',
  pos: 'bg-pos',
  neg: 'bg-neg',
  warn: 'bg-warn',
  muted: 'bg-fg-subtle',
};

export function Progress({ value = 0, tone = 'accent', className, align = 'left' }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', align === 'right' && 'flex justify-end', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500', PROGRESS_TONES[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function LiveDot({ live = true, className }) {
  return (
    <span className={cn('relative inline-flex h-2 w-2', className)}>
      {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pos opacity-50" />}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', live ? 'bg-pos' : 'bg-fg-subtle')} />
    </span>
  );
}
