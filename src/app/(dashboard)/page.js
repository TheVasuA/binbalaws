'use client';

import { useMemo, useState } from 'react';
import { Button, ButtonLink, Callout, Card, CardHeader, Page, PageLoader, Segmented, Stat, StatGrid } from '@/components/ui';
import { IconOrder, IconRefresh } from '@/components/ui/icons';
import { useAppConfig, usePortfolioSettings } from '@/components/providers/app-data';
import { useFuturesStream } from '@/components/providers/futures-stream';
import { PositionsTable, OpenOrdersTable } from '@/components/trading/positions-table';
import { DailyLimits, ExposurePanel, MarketPulse } from '@/components/trading/risk-overview';
import { TradingViewChart, CHART_INTERVALS } from '@/components/trading/tradingview-chart';
import { percent, signedUsd, usd, toneOf } from '@/lib/format';

function PositionCharts({ positions }) {
  const symbols = useMemo(() => [...new Set(positions.map((p) => p.symbol))], [positions]);
  const [picked, setPicked] = useState(null);
  const [interval, setChartInterval] = useState('60');
  const symbol = symbols.includes(picked) ? picked : symbols[0];

  if (!symbol) return null;

  return (
    <Card>
      <CardHeader
        title="Charts"
        actions={<Segmented size="xs" ariaLabel="Interval" value={interval} onChange={setChartInterval} options={CHART_INTERVALS} />}
      >
        {symbols.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1" role="tablist" aria-label="Symbol">
            {symbols.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={s === symbol}
                onClick={() => setPicked(s)}
                className={
                  s === symbol
                    ? 'h-6 rounded bg-surface-3 px-2 text-xs font-medium text-fg'
                    : 'h-6 rounded px-2 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg'
                }
              >
                {s.replace(/USDT$/, '')}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <div className="h-[460px]">
        <TradingViewChart symbol={symbol} interval={interval} />
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const config = useAppConfig();
  const settings = usePortfolioSettings();
  const { account, positions, openOrders, loaded, error, refetch, dailyRisk: risk } = useFuturesStream();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (!loaded && !error) return <PageLoader label="Loading account" />;

  if (!account) {
    return (
      <Page width="narrow">
        <Callout
          tone="danger"
          title="Could not load your futures account"
          action={<Button size="sm" variant="secondary" onClick={refresh} loading={refreshing}>Retry</Button>}
        >
          {error || 'No account data returned.'}
        </Callout>
      </Page>
    );
  }

  const unrealized = Number(account.totalUnrealizedProfit) || 0;
  const wallet = Number(account.totalWalletBalance) || 0;
  const maxOpen = Number(settings.maxOpenPositions) || 0;

  return (
    <Page>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Dashboard</h1>
          <p className="mt-0.5 text-[13px] text-fg-muted">Live account, risk and open positions.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={refresh} loading={refreshing}>
            {!refreshing && <IconRefresh size={14} />}
            Refresh
          </Button>
          {config.features.newOrder && config.trading.enabled && (
            <ButtonLink href="/new-order" variant="primary" size="sm">
              <IconOrder size={14} />
              New order
            </ButtonLink>
          )}
        </div>
      </div>

      {error && (
        <Callout tone="warn" className="mb-4" title="Showing the last known data">
          {error}
        </Callout>
      )}

      <StatGrid className="mb-4">
        <Stat label="Equity" value={usd(account.totalMarginBalance)} sub={`Wallet ${usd(wallet)}`} />
        <Stat
          label="Unrealized PnL"
          value={signedUsd(unrealized)}
          sub={wallet > 0 ? `${percent((unrealized / wallet) * 100, { signed: true })} of wallet` : undefined}
          tone={toneOf(unrealized)}
        />
        <Stat label="Today, net" value={signedUsd(risk.net)} sub={`Realized ${signedUsd(risk.realized)}`} tone={toneOf(risk.net)} />
        <Stat label="Available" value={usd(account.availableBalance)} sub="Free margin" />
        <Stat label="Open positions" value={positions.length} sub={maxOpen ? `Limit ${maxOpen}` : undefined} tone={maxOpen && positions.length > maxOpen ? 'neg' : 'default'} />
        <Stat label="Open orders" value={openOrders.length} sub="Resting on Binance" />
      </StatGrid>

      <div className="mb-4 grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <DailyLimits risk={risk} />
        </div>
        <div className="lg:col-span-4">
          <ExposurePanel positions={positions} account={account} maxOpen={maxOpen} />
        </div>
        <div className="lg:col-span-3">
          <MarketPulse />
        </div>
      </div>

      <Card className="mb-4">
        <CardHeader title="Positions" description="Sorted by size. PnL updates with every mark price." />
        <PositionsTable positions={positions} onRefresh={refetch} />
      </Card>

      {openOrders.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Open orders" description="Resting entry and exit orders." />
          <OpenOrdersTable orders={openOrders} onRefresh={refetch} />
        </Card>
      )}

      <PositionCharts positions={positions} />
    </Page>
  );
}
