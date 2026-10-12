import { cn } from '@/lib/cn';

const TONES = {
  neutral: 'bg-surface-3 text-fg-muted',
  pos: 'bg-pos/12 text-pos',
  neg: 'bg-neg/12 text-neg',
  warn: 'bg-warn/14 text-warn',
  accent: 'bg-accent/12 text-accent',
  outline: 'border border-line text-fg-muted',
};

const DOTS = {
  neutral: 'bg-fg-subtle',
  pos: 'bg-pos',
  neg: 'bg-neg',
  warn: 'bg-warn',
  accent: 'bg-accent',
  outline: 'bg-fg-subtle',
};

export function Badge({ tone = 'neutral', dot = false, className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded px-1.5 text-[11px] font-medium leading-none',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[tone])} />}
      {children}
    </span>
  );
}

/** Long/short side marker used in every positions list. */
export function SideBadge({ side }) {
  const s = String(side || '').toUpperCase();
  const long = s === 'LONG' || s === 'BUY';
  return <Badge tone={long ? 'pos' : 'neg'}>{long ? 'Long' : 'Short'}</Badge>;
}

/** Leverage marker; tone escalates with leverage. */
export function LeverageBadge({ leverage, warnAt = 10, dangerAt = 20 }) {
  const lev = Number(leverage) || 0;
  const tone = lev >= dangerAt ? 'neg' : lev >= warnAt ? 'warn' : 'neutral';
  return <Badge tone={tone} className="num">{lev}x</Badge>;
}
