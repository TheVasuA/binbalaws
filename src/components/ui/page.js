import { cn } from '@/lib/cn';

export function Page({ className, children, width = 'wide' }) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 pb-16 pt-6 sm:px-6 lg:px-8',
        width === 'narrow' ? 'max-w-4xl' : width === 'medium' ? 'max-w-6xl' : 'max-w-[1600px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({ title, description, actions, className }) {
  return (
    <header className={cn('mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Secondary in-page navigation rendered as an underlined tab bar. */
export function TabBar({ tabs, value, onChange, className }) {
  return (
    <div className={cn('-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line px-1', className)} role="tablist">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative -mb-px flex h-9 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-[13px] font-medium transition-colors',
              active ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="num rounded bg-surface-3 px-1.5 text-[11px] text-fg-muted">{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
