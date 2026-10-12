'use client';

import { useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Button, Callout, Card, CardBody, CardHeader, EmptyState, Page, PageHeader, Progress, Segmented, Skeleton,
  Stat, StatGrid, Table, TabBar, Td, Th, THead, Tr,
} from '@/components/ui';
import { IconChart, IconRefresh } from '@/components/ui/icons';
import { useApi } from '@/lib/use-api';
import { dateTime, signedUsd, TONE_TEXT, toneOf, usd } from '@/lib/format';
import {
  PERIODS, advancedStats, bestWorstDay, buildByCoin, buildByHour, buildByWeekday, buildTimeSeries, filterByPeriod, maxDrawdown, mergeFills,
} from '@/lib/tradeAnalytics';
import { cn } from '@/lib/cn';

const VIEWS = [
  { value: 'overview', label: 'Overview' },
  { value: 'insights', label: 'Insights' },
  { value: 'coins', label: 'By coin' },
  { value: 'log', label: 'Trade log' },
];

const AXIS = { fill: 'var(--fg-subtle)', fontSize: 11 };
const GRID = { stroke: 'var(--line)', strokeDasharray: '3 3', vertical: false };
const signColor = (v) => (v >= 0 ? 'var(--pos)' : 'var(--neg)');

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs shadow-pop">
      {label !== undefined && <p className="mb-0.5 text-fg-muted">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey} className={cn('num', TONE_TEXT[toneOf(p.value)])}>
          {p.name}: {signedUsd(p.value)}
        </p>
      ))}
    </div>
  );
}

function PnlBars({ data, xKey, height = 220, xProps }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} {...xProps} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-3)' }} />
        <ReferenceLine y={0} stroke="var(--line-strong)" />
        <Bar dataKey="pnl" name="PnL" radius={[2, 2, 0, 0]} maxBarSize={28}>
          {data.map((d, i) => <Cell key={i} fill={signColor(d.pnl)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Overview({ stats, series, dd, days, period }) {
  const last = series.at(-1)?.cumulative ?? 0;
  return (
    <div className="space-y-4">
      <StatGrid className="lg:grid-cols-4">
        <Stat label="Net PnL" value={signedUsd(stats.net)} tone={toneOf(stats.net)} sub={`${stats.count} trades`} />
        <Stat label="Win rate" value={`${stats.winRate.toFixed(1)}%`} sub={`${stats.wins} won, ${stats.losses} lost`} />
        <Stat
          label="Profit factor"
          value={stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
          sub={`Expectancy ${signedUsd(stats.expectancy)}`}
        />
        <Stat label="Max drawdown" value={dd.maxDrawdown ? `−${usd(dd.maxDrawdown)}` : usd(0)} tone={dd.maxDrawdown ? 'neg' : 'default'} sub={`${days.greenDays} green, ${days.redDays} red days`} />
      </StatGrid>

      <Card>
        <CardHeader title="Cumulative PnL" description="Running total of realized PnL across the window." />
        <CardBody className="pt-2">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--line-strong)' }} />
              <ReferenceLine y={0} stroke="var(--line-strong)" />
              <Area
                type="monotone"
                dataKey="cumulative"
                name="Cumulative"
                stroke={signColor(last)}
                strokeWidth={1.75}
                fill={signColor(last)}
                fillOpacity={0.08}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title={`PnL per ${period === '1d' ? 'hour' : 'day'}`} />
          <CardBody className="pt-2"><PnlBars data={series} xKey="label" /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Win and loss" />
          <CardBody className="space-y-5">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="num text-2xl font-semibold text-fg">{stats.winRate.toFixed(0)}%</span>
                <span className="num text-xs text-fg-muted">{stats.wins} / {stats.count}</span>
              </div>
              <Progress value={stats.winRate} tone="pos" />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
              <div><dt className="text-xs text-fg-muted">Gross profit</dt><dd className="num text-pos">{signedUsd(stats.profit)}</dd></div>
              <div><dt className="text-xs text-fg-muted">Gross loss</dt><dd className="num text-neg">{signedUsd(stats.loss)}</dd></div>
              <div><dt className="text-xs text-fg-muted">Average win</dt><dd className="num text-fg">{usd(stats.avgWin)}</dd></div>
              <div><dt className="text-xs text-fg-muted">Average loss</dt><dd className="num text-fg">{usd(Math.abs(stats.avgLoss))}</dd></div>
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Insights({ stats, days, byWeekday, byHour }) {
  return (
    <div className="space-y-4">
      <StatGrid className="lg:grid-cols-4">
        <Stat label="Expectancy per trade" value={signedUsd(stats.expectancy)} tone={toneOf(stats.expectancy)} />
        <Stat label="Longest win streak" value={stats.maxWinStreak} sub={`Longest loss streak ${stats.maxLossStreak}`} />
        <Stat label="Best day" value={days.best ? signedUsd(days.best.pnl) : '—'} tone={days.best ? toneOf(days.best.pnl) : 'default'} />
        <Stat label="Worst day" value={days.worst ? signedUsd(days.worst.pnl) : '—'} tone={days.worst ? toneOf(days.worst.pnl) : 'default'} />
      </StatGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="By day of week" />
          <CardBody className="pt-2"><PnlBars data={byWeekday} xKey="name" /></CardBody>
        </Card>
        <Card>
          <CardHeader title="By hour of day" description="Local time." />
          <CardBody className="pt-2"><PnlBars data={byHour} xKey="label" xProps={{ minTickGap: 4 }} /></CardBody>
        </Card>
      </div>
    </div>
  );
}

function ByCoin({ byCoin }) {
  const maxAbs = Math.max(1, ...byCoin.map((c) => Math.abs(c.net)));
  return (
    <Card>
      <Table>
        <THead>
          <Th>Coin</Th>
          <Th align="right">Trades</Th>
          <Th align="right" className="hidden sm:table-cell">Profit</Th>
          <Th align="right" className="hidden sm:table-cell">Loss</Th>
          <Th align="right">Net</Th>
          <Th className="hidden w-40 md:table-cell"><span className="sr-only">Share</span></Th>
        </THead>
        <tbody>
          {byCoin.map((c) => (
            <Tr key={c.symbol}>
              <Td className="font-medium text-fg">{c.symbol}</Td>
              <Td align="right" className="text-fg-muted">{c.count}</Td>
              <Td align="right" className="hidden text-pos sm:table-cell">{signedUsd(c.profit)}</Td>
              <Td align="right" className="hidden text-neg sm:table-cell">{signedUsd(c.loss)}</Td>
              <Td align="right" className={cn('font-medium', TONE_TEXT[toneOf(c.net)])}>{signedUsd(c.net)}</Td>
              <Td className="hidden md:table-cell">
                <Progress value={(Math.abs(c.net) / maxAbs) * 100} tone={c.net >= 0 ? 'pos' : 'neg'} />
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function TradeLog({ trades }) {
  const rows = useMemo(() => [...trades].sort((a, b) => b.timestamp - a.timestamp), [trades]);
  return (
    <Card>
      <Table className="max-h-[70vh] overflow-y-auto">
        <THead sticky>
          <Th>Symbol</Th>
          <Th>Closed</Th>
          <Th align="right">Fills</Th>
          <Th align="right">Realized PnL</Th>
        </THead>
        <tbody>
          {rows.map((t) => (
            <Tr key={t.id}>
              <Td className="font-medium text-fg">{(t.symbol || '').replace(/USDT$/, '')}</Td>
              <Td className="num text-fg-muted">{dateTime(t.timestamp)}</Td>
              <Td align="right" className="text-fg-subtle">{t.fills}</Td>
              <Td align="right" className={cn('font-medium', TONE_TEXT[toneOf(t.income)])}>{signedUsd(t.income)}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

export default function HistoryPage() {
  const [view, setView] = useState('overview');
  const [period, setPeriod] = useState('1m');
  const { data: trades, loading, error, refetch } = useApi('/api/trades?type=pnl&limit=1000');
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const merged = useMemo(() => mergeFills(Array.isArray(trades) ? trades : []), [trades]);
  const scoped = useMemo(() => filterByPeriod(merged, period), [merged, period]);
  const stats = useMemo(() => advancedStats(scoped), [scoped]);
  const series = useMemo(() => buildTimeSeries(scoped, period), [scoped, period]);
  const dd = useMemo(() => maxDrawdown(series), [series]);
  const days = useMemo(() => bestWorstDay(scoped), [scoped]);
  const byCoin = useMemo(() => buildByCoin(scoped), [scoped]);
  const byWeekday = useMemo(() => buildByWeekday(scoped), [scoped]);
  const byHour = useMemo(() => buildByHour(scoped), [scoped]);

  const periodLabel = PERIODS.find((p) => p.id === period)?.label;

  let body;
  if (loading && !trades) {
    body = (
      <div className="space-y-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-72" />
      </div>
    );
  } else if (!scoped.length) {
    body = (
      <Card>
        <EmptyState icon={IconChart} title="No closed trades" description={`Nothing was realized in the ${periodLabel} window.`} />
      </Card>
    );
  } else if (view === 'overview') {
    body = <Overview stats={stats} series={series} dd={dd} days={days} period={period} />;
  } else if (view === 'insights') {
    body = <Insights stats={stats} days={days} byWeekday={byWeekday} byHour={byHour} />;
  } else if (view === 'coins') {
    body = <ByCoin byCoin={byCoin} />;
  } else {
    body = <TradeLog trades={scoped} />;
  }

  return (
    <Page>
      <PageHeader
        title="History"
        description="Realized PnL from closed futures positions. Partial fills are merged into one trade."
        actions={
          <>
            <Segmented
              ariaLabel="Period"
              options={PERIODS.map((p) => ({ value: p.id, label: p.label }))}
              value={period}
              onChange={setPeriod}
            />
            <Button size="icon" variant="secondary" onClick={refresh} disabled={loading || refreshing} aria-label="Refresh">
              <IconRefresh size={15} className={cn((loading || refreshing) && 'animate-spin')} />
            </Button>
          </>
        }
      />
      <TabBar tabs={VIEWS.map((v) => (v.value === 'log' ? { ...v, count: scoped.length } : v))} value={view} onChange={setView} />
      {error && <Callout tone="danger" title="Could not load trades" className="mb-4">{error}</Callout>}
      {body}
    </Page>
  );
}
