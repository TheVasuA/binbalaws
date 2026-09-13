// Pure helpers to turn a flat list of realized-PnL trades into the shapes the
// History page charts need. A trade = { id, symbol, income, timestamp, ... }.

export const PERIODS = [
  { id: '1d', label: '1D', days: 1 },
  { id: '1w', label: '1W', days: 7 },
  { id: '1m', label: '1M', days: 30 },
  { id: 'all', label: 'All', days: null },
];

// Binance emits one REALIZED_PNL record per FILL, so a single position close
// can appear as many rows for the same symbol at the same timestamp (partial
// fills). Merge those into one logical trade: same symbol + same second.
export function mergeFills(trades) {
  const map = new Map();
  for (const t of trades || []) {
    // Round to the second to group fills of one close together.
    const sec = Math.floor((Number(t.timestamp) || 0) / 1000) * 1000;
    const key = `${t.symbol}:${sec}`;
    if (!map.has(key)) {
      map.set(key, {
        id: t.id || key,
        symbol: t.symbol,
        income: 0,
        fills: 0,
        timestamp: sec,
        datetime: t.datetime,
        asset: t.asset,
      });
    }
    const g = map.get(key);
    g.income += Number(t.income) || 0;
    g.fills += 1;
  }
  return [...map.values()]
    .map((g) => ({ ...g, income: Number(g.income.toFixed(8)) }))
    .sort((a, b) => b.timestamp - a.timestamp);
}

// Filter trades to a period window (from now going back `days`). null = all.
export function filterByPeriod(trades, periodId) {
  const period = PERIODS.find((p) => p.id === periodId) || PERIODS[2];
  if (!period.days) return [...(trades || [])];
  const cutoff = Date.now() - period.days * 24 * 60 * 60 * 1000;
  return (trades || []).filter((t) => t.timestamp >= cutoff);
}

// Headline stats for a set of trades.
export function summarize(trades) {
  const list = trades || [];
  let profit = 0;
  let loss = 0;
  let wins = 0;
  let losses = 0;
  for (const t of list) {
    const v = Number(t.income) || 0;
    if (v >= 0) { profit += v; wins += 1; } else { loss += v; losses += 1; }
  }
  const net = profit + loss;
  const count = list.length;
  const winRate = count > 0 ? (wins / count) * 100 : 0;
  const avgWin = wins > 0 ? profit / wins : 0;
  const avgLoss = losses > 0 ? loss / losses : 0;
  const best = list.reduce((m, t) => (Number(t.income) > (m?.income ?? -Infinity) ? t : m), null);
  const worst = list.reduce((m, t) => (Number(t.income) < (m?.income ?? Infinity) ? t : m), null);
  const profitFactor = loss !== 0 ? profit / Math.abs(loss) : (profit > 0 ? Infinity : 0);

  return {
    net, profit, loss, count, wins, losses, winRate,
    avgWin, avgLoss, profitFactor, best, worst,
  };
}

// Bucket key for a timestamp given the period granularity:
//  - 1d  → hourly buckets
//  - 1w  → daily buckets
//  - else→ daily buckets
function bucketMeta(periodId) {
  if (periodId === '1d') {
    return {
      key: (ts) => {
        const d = new Date(ts);
        d.setMinutes(0, 0, 0);
        return d.getTime();
      },
      label: (ts) => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit' }),
    };
  }
  return {
    key: (ts) => {
      const d = new Date(ts);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    },
    label: (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  };
}

// Time series: per-bucket PnL + running cumulative PnL. Sorted ascending.
export function buildTimeSeries(trades, periodId) {
  const { key, label } = bucketMeta(periodId);
  const buckets = new Map();

  for (const t of trades || []) {
    const k = key(t.timestamp);
    if (!buckets.has(k)) buckets.set(k, { t: k, pnl: 0, count: 0 });
    const b = buckets.get(k);
    b.pnl += Number(t.income) || 0;
    b.count += 1;
  }

  const sorted = [...buckets.values()].sort((a, b) => a.t - b.t);
  let cumulative = 0;
  return sorted.map((b) => {
    cumulative += b.pnl;
    return {
      t: b.t,
      label: label(b.t),
      pnl: Number(b.pnl.toFixed(2)),
      cumulative: Number(cumulative.toFixed(2)),
      count: b.count,
    };
  });
}

// Max drawdown from the cumulative-PnL equity curve (peak-to-trough).
// Returns { maxDrawdown (>=0), peak, trough }.
export function maxDrawdown(series) {
  let peak = 0;
  let maxDD = 0;
  for (const pt of series || []) {
    const eq = pt.cumulative;
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDD) maxDD = dd;
  }
  return { maxDrawdown: Number(maxDD.toFixed(2)) };
}

// Extended stats: expectancy per trade + streaks.
export function advancedStats(trades) {
  const list = [...(trades || [])].sort((a, b) => a.timestamp - b.timestamp);
  const s = summarize(list);
  // Expectancy = (winRate * avgWin) + (lossRate * avgLoss). avgLoss is negative.
  const winRate = s.count ? s.wins / s.count : 0;
  const lossRate = s.count ? s.losses / s.count : 0;
  const expectancy = winRate * s.avgWin + lossRate * s.avgLoss;

  // Longest win / loss streaks.
  let curW = 0, curL = 0, maxW = 0, maxL = 0;
  for (const t of list) {
    if ((Number(t.income) || 0) >= 0) { curW += 1; curL = 0; if (curW > maxW) maxW = curW; }
    else { curL += 1; curW = 0; if (curL > maxL) maxL = curL; }
  }
  return { ...s, expectancy, maxWinStreak: maxW, maxLossStreak: maxL };
}

// PnL grouped by day of the week (Sun..Sat).
export function buildByWeekday(trades) {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const acc = names.map((name) => ({ name, pnl: 0, count: 0, wins: 0 }));
  for (const t of trades || []) {
    const d = new Date(t.timestamp).getDay();
    const v = Number(t.income) || 0;
    acc[d].pnl += v;
    acc[d].count += 1;
    if (v >= 0) acc[d].wins += 1;
  }
  return acc.map((a) => ({
    ...a,
    pnl: Number(a.pnl.toFixed(2)),
    winRate: a.count ? Number(((a.wins / a.count) * 100).toFixed(0)) : 0,
  }));
}

// PnL grouped by hour of day (0..23).
export function buildByHour(trades) {
  const acc = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${h}`, pnl: 0, count: 0 }));
  for (const t of trades || []) {
    const h = new Date(t.timestamp).getHours();
    acc[h].pnl += Number(t.income) || 0;
    acc[h].count += 1;
  }
  return acc.map((a) => ({ ...a, pnl: Number(a.pnl.toFixed(2)) }));
}

// Best / worst single day by net PnL (uses daily buckets).
export function bestWorstDay(trades) {
  const byDay = new Map();
  for (const t of trades || []) {
    const d = new Date(t.timestamp); d.setHours(0, 0, 0, 0);
    const k = d.getTime();
    byDay.set(k, (byDay.get(k) || 0) + (Number(t.income) || 0));
  }
  let best = null; let worst = null;
  for (const [k, v] of byDay) {
    if (!best || v > best.pnl) best = { day: k, pnl: v };
    if (!worst || v < worst.pnl) worst = { day: k, pnl: v };
  }
  const green = [...byDay.values()].filter((v) => v >= 0).length;
  const red = [...byDay.values()].filter((v) => v < 0).length;
  return { best, worst, greenDays: green, redDays: red, tradingDays: byDay.size };
}

// Net PnL per coin, split into profit/loss, sorted by net descending.
export function buildByCoin(trades) {
  const map = new Map();
  for (const t of trades || []) {
    const sym = (t.symbol || '').replace(/USDT$/, '');
    if (!map.has(sym)) map.set(sym, { symbol: sym, net: 0, profit: 0, loss: 0, count: 0 });
    const c = map.get(sym);
    const v = Number(t.income) || 0;
    c.net += v;
    if (v >= 0) c.profit += v; else c.loss += v;
    c.count += 1;
  }
  return [...map.values()]
    .map((c) => ({
      ...c,
      net: Number(c.net.toFixed(2)),
      profit: Number(c.profit.toFixed(2)),
      loss: Number(c.loss.toFixed(2)),
    }))
    .sort((a, b) => b.net - a.net);
}
