'use client';

import { useMemo, useState } from 'react';
import { ButtonLink, Callout, Card, CardHeader, EmptyState, Input, Page, PageHeader, Skeleton, Table, TabBar, Td, Th, THead, Tr } from '@/components/ui';
import { IconGlobe, IconSearch } from '@/components/ui/icons';
import { useApi } from '@/lib/use-api';
import { compactUsd, percent, price as fmtPrice, TONE_TEXT, toneOf } from '@/lib/format';
import { TRADIFI_COMMODITY_NAMES, TRADIFI_NAMES } from '@/lib/tradfi';
import { cn } from '@/lib/cn';

const STOCK_GROUPS = [
  { group: 'Mega-cap tech', bases: ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'AVGO', 'ORCL', 'CRM', 'AMD', 'ADBE', 'INTC', 'QCOM', 'MU', 'TXN', 'CSCO', 'IBM', 'DELL', 'PLTR', 'SMCI', 'ARM', 'ASML', 'TSM'] },
  { group: 'Software and internet', bases: ['CRWD', 'PANW', 'SNOW', 'NET', 'DDOG', 'SHOP', 'UBER', 'ZM', 'TEAM', 'MDB', 'GTLB', 'ZS', 'NOW', 'APP', 'RDDT', 'DKNG'] },
  { group: 'Crypto and fintech', bases: ['COIN', 'MSTR', 'HOOD', 'CRCL', 'MARA', 'IREN', 'BMNR', 'NBIS', 'SOFI', 'PYPL', 'PAYP', 'V', 'JPM', 'GS'] },
  { group: 'Consumer, auto and other', bases: ['TSLA', 'WMT', 'COST', 'HD', 'KO', 'DIS', 'CAT', 'GME', 'RIVN', 'HIMS', 'WEN', 'EBAY', 'GPRO', 'TTWO', 'DJT'] },
  { group: 'Healthcare', bases: ['LLY', 'MRK', 'MRNA', 'NVO'] },
  { group: 'AI labs and robotics', bases: ['OPENAI', 'ANTHROPIC', 'ZHIPU', 'MINIMAX', 'UNITREE', 'IONQ'] },
  { group: 'China and Asia', bases: ['BABA', 'PDD', 'TENCENT', 'MEITUAN', 'BYD', 'SONY', 'SAMSUNG', 'HYUNDAI', 'NAVER', 'KUAISHOU', 'POPMART', 'KODEX200'] },
  { group: 'ETFs, indices and leveraged', bases: ['SPY', 'QQQ', 'IWM', 'TQQQ', 'SQQQ', 'SOXL', 'SOXS', 'SMH', 'GDX', 'XLE', 'XBI', 'URNM', 'UVXY', 'TSLL', 'NVDL', 'MVLL', 'BITO'] },
];

function groupStocks(items) {
  const byBase = new Map(items.map((i) => [i.base, i]));
  const used = new Set();
  const sections = STOCK_GROUPS.map(({ group, bases }) => {
    const rows = bases.filter((b) => byBase.has(b)).map((b) => {
      used.add(b);
      return byBase.get(b);
    });
    return { group, rows };
  });
  const others = items.filter((i) => !used.has(i.base)).sort((a, b) => a.base.localeCompare(b.base));
  sections.push({ group: 'Other', rows: others });
  return sections.filter((s) => s.rows.length);
}

function MarketTable({ rows, stats, statsLoading }) {
  return (
    <Table>
      <THead>
        <Th>Instrument</Th>
        <Th align="right">Last</Th>
        <Th align="right">24h</Th>
        <Th align="right" className="hidden sm:table-cell">Volume</Th>
        <Th align="right"><span className="sr-only">Action</span></Th>
      </THead>
      <tbody>
        {rows.map((r) => {
          const s = stats?.[r.symbol];
          return (
            <Tr key={r.symbol}>
              <Td>
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate font-medium text-fg">{r.name}</span>
                  <span className="num text-xs text-fg-subtle">{r.base}</span>
                </div>
              </Td>
              <Td align="right" className="text-fg">
                {s ? fmtPrice(s.last) : statsLoading ? <Skeleton className="ml-auto h-3.5 w-14" /> : '—'}
              </Td>
              <Td align="right" className={cn(s && TONE_TEXT[toneOf(s.change)])}>
                {s ? percent(s.change, { signed: true }) : '—'}
              </Td>
              <Td align="right" className="hidden text-fg-muted sm:table-cell">{s ? compactUsd(s.volume) : '—'}</Td>
              <Td align="right" className="w-px">
                <ButtonLink href={`/new-order?symbol=${r.symbol}`} size="xs" variant="secondary">Trade</ButtonLink>
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}

export default function MarketsPage() {
  const [view, setView] = useState('tradfi');
  const [query, setQuery] = useState('');
  const symbols = useApi('/api/futures?type=symbols');
  const daily = useApi(`/api/futures?type=daily&category=${view}`, { refreshMs: 30_000 });

  const instruments = useMemo(() => {
    const list = Array.isArray(symbols.data) ? symbols.data : [];
    const names = { tradfi: TRADIFI_NAMES, commodity: TRADIFI_COMMODITY_NAMES };
    const counts = { tradfi: 0, commodity: 0 };
    const items = [];
    for (const s of list) {
      if (s.category !== 'tradfi' && s.category !== 'commodity') continue;
      counts[s.category] += 1;
      if (s.category === view) items.push({ symbol: s.symbol, base: s.baseAsset, name: names[view][s.baseAsset] || s.baseAsset });
    }
    return { items, counts };
  }, [symbols.data, view]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return instruments.items;
    return instruments.items.filter((i) => i.base.toLowerCase().includes(q) || i.name.toLowerCase().includes(q));
  }, [instruments.items, query]);

  const sections = useMemo(
    () => (view === 'tradfi' ? groupStocks(filtered) : [{ group: 'Commodities', rows: [...filtered].sort((a, b) => a.name.localeCompare(b.name)) }]),
    [filtered, view],
  );

  const loading = symbols.loading && !symbols.data;

  return (
    <Page width="medium">
      <PageHeader
        title="Markets"
        description="Tokenized stocks, ETFs and commodities listed as USDT-margined perpetuals."
        actions={
          <Input
            size="sm"
            prefix={<IconSearch size={14} />}
            placeholder="Search name or ticker"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full sm:w-64"
            aria-label="Search markets"
          />
        }
      />

      <TabBar
        tabs={[
          { value: 'tradfi', label: 'Stocks and ETFs', count: instruments.counts.tradfi },
          { value: 'commodity', label: 'Commodities', count: instruments.counts.commodity },
        ]}
        value={view}
        onChange={setView}
      />

      {symbols.error && <Callout tone="danger" title="Could not load symbols" className="mb-4">{symbols.error}</Callout>}

      {view === 'tradfi' && (
        <p className="mb-4 text-xs text-fg-muted">
          These contracts follow the underlying market&apos;s session hours. Orders placed while the market is closed may be rejected.
        </p>
      )}

      {loading ? (
        <Card className="space-y-3 p-4">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-5" />)}
        </Card>
      ) : sections.length === 0 ? (
        <Card>
          <EmptyState
            icon={IconGlobe}
            title={query ? 'No matches' : 'Nothing listed'}
            description={query ? `No instrument matches "${query}".` : 'The exchange returned no instruments in this category.'}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {sections.map((sec) => (
            <Card key={sec.group}>
              {view === 'tradfi' && (
                <CardHeader title={sec.group} actions={<span className="num text-xs text-fg-subtle">{sec.rows.length}</span>} />
              )}
              <MarketTable rows={sec.rows} stats={daily.data} statsLoading={daily.loading && !daily.data} />
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}
