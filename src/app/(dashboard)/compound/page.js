'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge, Button, Callout, Card, CardBody, CardHeader, EmptyState, Menu, MenuItem, MenuSeparator, Page, PageHeader,
  Progress, Skeleton, Stat, StatGrid, Table, Td, Th, THead, Tr, useConfirm,
} from '@/components/ui';
import { IconCheck, IconMore, IconRefresh, IconTarget, IconTrash, IconUndo, IconWallet } from '@/components/ui/icons';
import { useAppData } from '@/components/providers/app-data';
import { useFuturesStream } from '@/components/providers/futures-stream';
import { useGoal } from '@/components/shell/goal-summary';
import { dateTime, percent, usd } from '@/lib/format';
import { useNotify } from '@/lib/notify';
import { cn } from '@/lib/cn';

function MilestoneTable({ milestones, completed, records, rate }) {
  const currentRef = useRef(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' });
  }, [completed]);

  return (
    <Table className="max-h-[480px] overflow-y-auto">
      <THead sticky>
        <Th align="right" className="w-12">#</Th>
        <Th align="right">Start</Th>
        <Th align="right">Profit</Th>
        <Th align="right">End</Th>
        <Th className="hidden sm:table-cell">Status</Th>
      </THead>
      <tbody>
        {milestones.map((m) => {
          const done = m.trade <= completed;
          const current = m.trade === completed + 1;
          const at = records[m.trade - 1]?.completedAt;
          return (
            <Tr key={m.trade} ref={current ? currentRef : undefined} className={cn(current && 'bg-accent/5 hover:bg-accent/8')}>
              <Td align="right" className={cn(done ? 'text-fg-subtle' : current ? 'font-semibold text-accent' : 'text-fg-muted')}>{m.trade}</Td>
              <Td align="right" className={done ? 'text-fg-muted' : 'text-fg'}>{usd(m.startBalance)}</Td>
              <Td align="right" className={done ? 'text-fg-muted' : 'text-pos'}>+{usd(m.profit)}</Td>
              <Td align="right" className={done ? 'text-fg-muted' : 'text-fg'}>{usd(m.endBalance)}</Td>
              <Td className="hidden sm:table-cell">
                {done ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                    <IconCheck size={13} className="text-pos" />
                    {at ? dateTime(at) : 'Done'}
                  </span>
                ) : current ? (
                  <Badge tone="accent">Next</Badge>
                ) : (
                  <span className="num text-xs text-fg-subtle">+{percent(rate, { decimals: 2 })}</span>
                )}
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}

export default function GoalPage() {
  const { compound, saveCompound } = useAppData();
  const { account, loaded } = useFuturesStream();
  const goal = useGoal();
  const confirm = useConfirm();
  const { notify } = useNotify();
  const [busy, setBusy] = useState(false);

  const wallet = Number(account?.totalWalletBalance) || 0;
  const records = useMemo(() => compound?.completedTrades || [], [compound]);
  const lockedStart = Number(compound?.startingBalance) || 0;

  // The ladder is anchored to the starting balance; lock it the first time a
  // wallet balance is known so the milestones stop moving with the wallet.
  const lockedRef = useRef(false);
  useEffect(() => {
    if (!compound || lockedStart > 0 || !(wallet > 0) || lockedRef.current) return;
    lockedRef.current = true;
    saveCompound({ startingBalance: wallet, completedTrades: records }).catch(() => {
      lockedRef.current = false;
    });
  }, [compound, lockedStart, wallet, records, saveCompound]);

  const persist = async (next, message) => {
    setBusy(true);
    try {
      await saveCompound(next);
      if (message) notify({ level: 'success', title: message });
    } catch (err) {
      notify({ level: 'danger', title: 'Could not save', message: err.message });
    } finally {
      setBusy(false);
    }
  };

  const markComplete = () => {
    const m = goal.current;
    if (!m) return;
    persist(
      {
        startingBalance: goal.startBalance,
        completedTrades: [
          ...records.slice(0, goal.completed),
          { trade: m.trade, startBalance: m.startBalance, endBalance: m.endBalance, profit: m.profit, completedAt: new Date().toISOString() },
        ],
      },
      `Trade ${m.trade} marked complete`,
    );
  };

  const undo = () => {
    if (!goal.completed) return;
    persist({ startingBalance: goal.startBalance, completedTrades: records.slice(0, goal.completed - 1) }, `Stepped back to trade ${goal.completed}`);
  };

  const rebase = async () => {
    const ok = await confirm({
      title: 'Re-anchor to current wallet?',
      description: `The ladder will start from ${usd(wallet)} instead of ${usd(goal.startBalance)}. Completed steps are kept and the remaining milestones are recalculated.`,
      confirmLabel: 'Re-anchor',
    });
    if (ok) persist({ startingBalance: wallet, completedTrades: records }, 'Starting balance updated');
  };

  const reset = async () => {
    const ok = await confirm({
      tone: 'danger',
      title: 'Reset goal progress?',
      description: `All ${goal.completed} completed steps are cleared and the ladder restarts from your current wallet of ${usd(wallet)}.`,
      confirmLabel: 'Reset progress',
    });
    if (ok) persist({ startingBalance: wallet > 0 ? wallet : goal.startBalance, completedTrades: [] }, 'Goal progress reset');
  };

  const ready = compound && (lockedStart > 0 || loaded);
  const achieved = goal.total > 0 && goal.completed >= goal.total;
  const vsPlan = goal.current ? wallet - goal.current.startBalance : 0;

  return (
    <Page width="medium">
      <PageHeader
        title="Goal"
        description={`Compound ${percent(goal.percent, { decimals: 2 })} per trade from ${usd(goal.startBalance, 0)} to ${usd(goal.target, 0)}.`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={undo} disabled={!goal.completed || busy}>
              <IconUndo size={14} />
              Undo step
            </Button>
            <Menu
              trigger={(props) => (
                <Button {...props} variant="secondary" size="icon" aria-label="More actions">
                  <IconMore size={16} />
                </Button>
              )}
            >
              <MenuItem icon={IconRefresh} onSelect={rebase} disabled={!(wallet > 0) || busy} description="Recalculate from the current wallet">
                Re-anchor start
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={IconTrash} tone="danger" onSelect={reset} disabled={busy}>
                Reset progress
              </MenuItem>
            </Menu>
          </>
        }
      />

      {!ready ? (
        <div className="space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
          <Skeleton className="h-80" />
        </div>
      ) : !goal.total ? (
        <Card>
          <EmptyState
            icon={IconTarget}
            title="No ladder to show"
            description={
              goal.startBalance >= goal.target
                ? `Your starting balance already meets the ${usd(goal.target, 0)} target. Raise the target in the admin panel.`
                : 'A starting balance is needed to build the ladder. It is taken from your futures wallet once it loads.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <StatGrid className="lg:grid-cols-4">
            <Stat label="Starting balance" value={usd(goal.startBalance)} sub={compound?.updatedAt ? `Saved ${dateTime(compound.updatedAt)}` : undefined} />
            <Stat label="Wallet now" value={wallet > 0 ? usd(wallet) : '—'} sub={goal.current && wallet > 0 ? `${vsPlan >= 0 ? '+' : '−'}${usd(Math.abs(vsPlan))} vs plan` : undefined} tone={wallet > 0 && goal.current ? (vsPlan >= 0 ? 'pos' : 'neg') : 'default'} />
            <Stat label="Target" value={usd(goal.target, 0)} />
            <Stat label="Steps remaining" value={goal.remaining} sub={`${goal.completed} of ${goal.total} done`} />
          </StatGrid>

          {achieved ? (
            <Callout tone="success" title="Goal reached">
              All {goal.total} steps are complete. Set a new target in the admin panel to keep compounding.
            </Callout>
          ) : (
            <Card>
              <CardBody className="space-y-4">
                <div>
                  <div className="mb-2 flex items-baseline justify-between text-xs">
                    <span className="font-medium text-fg-muted">Overall progress</span>
                    <span className="num text-fg-muted">{goal.progress.toFixed(1)}%</span>
                  </div>
                  <Progress value={goal.progress} />
                </div>

                <div className="flex flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="grid grid-cols-3 gap-6">
                    <Stat size="sm" label={`Step ${goal.current.trade}`} value={usd(goal.current.startBalance)} sub="Start" />
                    <Stat size="sm" label="Profit target" value={`+${usd(goal.current.profit)}`} tone="pos" sub={`+${percent(goal.percent, { decimals: 2 })}`} />
                    <Stat size="sm" label="End balance" value={usd(goal.current.endBalance)} sub="After this step" />
                  </div>
                  <Button variant="buy" onClick={markComplete} loading={busy} className="sm:w-auto">
                    <IconCheck size={15} />
                    Mark step {goal.current.trade} complete
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {!(wallet > 0) && loaded && (
            <Callout tone="warn" title="Wallet balance unavailable">
              <span className="inline-flex items-center gap-1.5"><IconWallet size={13} /> Re-anchoring and reset need a live wallet balance.</span>
            </Callout>
          )}

          <Card>
            <CardHeader title="Milestones" description={`${goal.total} steps of ${percent(goal.percent, { decimals: 2 })} each.`} />
            <MilestoneTable milestones={goal.milestones} completed={goal.completed} records={records} rate={goal.percent} />
          </Card>
        </div>
      )}
    </Page>
  );
}
