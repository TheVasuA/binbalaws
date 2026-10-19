'use client';

import { Badge, EmptyState, Skeleton } from '@/components/ui';
import { IconScroll } from '@/components/ui/icons';
import { dateTime, relativeTime } from '@/lib/format';
import { cn } from '@/lib/cn';

const AREA_TONES = {
  login: 'neutral',
  logout: 'neutral',
  trading: 'neg',
  config: 'accent',
  settings: 'accent',
  basket: 'warn',
  goal: 'pos',
  orders: 'warn',
  cache: 'neutral',
};

export function auditTone(action = '') {
  if (action.endsWith('.failed')) return 'neg';
  return AREA_TONES[action.split('.')[0]] || 'neutral';
}

export function AuditList({ entries, loading, compact = false }) {
  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: compact ? 4 : 8 }, (_, i) => <Skeleton key={i} className="h-4" />)}
      </div>
    );
  }
  if (!entries?.length) {
    return <EmptyState icon={IconScroll} title="No activity yet" description="Admin sign-ins and changes are recorded here." />;
  }
  return (
    <ul className="divide-y divide-line">
      {entries.map((e, i) => (
        <li key={`${e.at}-${i}`} className={cn('flex items-start gap-3 px-4', compact ? 'py-2.5' : 'py-3')}>
          <Badge tone={auditTone(e.action)} className="num mt-px shrink-0 font-mono">{e.action}</Badge>
          <p className={cn('min-w-0 flex-1 text-[13px] text-fg-muted', compact ? 'truncate' : 'break-words')} title={e.detail || undefined}>
            {e.detail || <span className="text-fg-subtle">No details</span>}
          </p>
          <time dateTime={e.at} title={dateTime(e.at)} className="num shrink-0 text-xs text-fg-subtle">
            {relativeTime(e.at)}
          </time>
        </li>
      ))}
    </ul>
  );
}
