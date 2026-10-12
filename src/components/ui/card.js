import { cn } from '@/lib/cn';

export function Card({ as: Tag = 'section', className, children, ...props }) {
  return (
    <Tag className={cn('rounded-lg border border-line bg-surface', className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, actions, className, children }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3', className)}>
      <div className="min-w-0">
        {title && <h2 className="text-[13px] font-semibold tracking-tight text-fg">{title}</h2>}
        {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }) {
  return <div className={cn('p-4', className)}>{children}</div>;
}

const STAT_TONES = {
  default: 'text-fg',
  pos: 'text-pos',
  neg: 'text-neg',
  warn: 'text-warn',
  accent: 'text-accent',
  muted: 'text-fg-muted',
};

export function Stat({ label, value, sub, tone = 'default', size = 'md', className }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="truncate text-xs text-fg-muted">{label}</p>
      <p
        className={cn(
          'num mt-1 truncate font-semibold tracking-tight',
          size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-lg',
          STAT_TONES[tone],
        )}
      >
        {value}
      </p>
      {sub && <p className="num mt-0.5 truncate text-xs text-fg-subtle">{sub}</p>}
    </div>
  );
}

/** A row of stats separated by hairlines, collapsing to a grid on small screens. */
export function StatGrid({ children, className }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 lg:grid-cols-6',
        '[&>*]:bg-surface [&>*]:px-4 [&>*]:py-3.5',
        className,
      )}
    >
      {children}
    </div>
  );
}
