'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Progress } from '@/components/ui';
import { useAppData } from '@/components/providers/app-data';
import { useFuturesStream } from '@/components/providers/futures-stream';
import { goalSummary } from '@/lib/goal';
import { compactUsd, usd } from '@/lib/format';

export function useGoal() {
  const { compound, settings } = useAppData();
  const { account } = useFuturesStream();
  const startBalance = Number(compound?.startingBalance) || Number(account?.totalWalletBalance) || 0;

  return useMemo(
    () => ({
      startBalance,
      target: Number(settings.goalTarget),
      percent: Number(settings.compoundPercent),
      ...goalSummary({
        startBalance,
        target: Number(settings.goalTarget),
        percent: Number(settings.compoundPercent),
        completed: compound?.completedTrades?.length || 0,
      }),
    }),
    [startBalance, settings.goalTarget, settings.compoundPercent, compound?.completedTrades?.length],
  );
}

/** Compact goal widget for the sidebar footer. */
export function GoalSummary({ onNavigate }) {
  const goal = useGoal();
  if (!goal.total) return null;

  return (
    <Link
      href="/compound"
      onClick={onNavigate}
      className="block rounded-md border border-line bg-surface-2 p-3 transition-colors hover:border-line-strong"
    >
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-fg">Goal {compactUsd(goal.target)}</span>
        <span className="num text-fg-muted">
          {goal.completed}/{goal.total}
        </span>
      </div>
      <Progress value={goal.progress} className="mt-2" />
      {goal.current && (
        <p className="num mt-2 text-xs text-fg-muted">
          Next: <span className="text-pos">+{usd(goal.current.profit)}</span> to {usd(goal.current.endBalance, 0)}
        </p>
      )}
    </Link>
  );
}
