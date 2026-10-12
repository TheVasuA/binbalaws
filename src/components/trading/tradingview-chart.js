'use client';

import { memo, useEffect, useRef } from 'react';
import { useResolvedTheme } from '@/lib/theme';

const PALETTE = {
  dark: { bg: '#111418', grid: 'rgba(0,0,0,0)' },
  light: { bg: '#ffffff', grid: 'rgba(0,0,0,0)' },
};

/**
 * TradingView advanced-chart embed. Re-mounts on symbol, interval or theme
 * change. `symbol` is a Binance symbol; perpetuals get the `.P` suffix.
 */
function TradingViewChartImpl({ symbol, interval = '60', perpetual = true, studies = [], className }) {
  const ref = useRef(null);
  const theme = useResolvedTheme();
  const studiesKey = studies.join(',');

  useEffect(() => {
    const el = ref.current;
    if (!el || !symbol) return undefined;
    el.innerHTML = '';

    const host = document.createElement('div');
    host.className = 'tradingview-widget-container__widget h-full w-full';
    el.appendChild(host);

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.type = 'text/javascript';
    script.innerHTML = JSON.stringify({
      symbol: `BINANCE:${symbol}${perpetual ? '.P' : ''}`,
      interval,
      width: '100%',
      height: '100%',
      timezone: 'Etc/UTC',
      theme,
      style: '1',
      locale: 'en',
      backgroundColor: PALETTE[theme].bg,
      gridColor: PALETTE[theme].grid,
      allow_symbol_change: false,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: true,
      hide_volume: true,
      save_image: false,
      calendar: false,
      withdateranges: false,
      studies: studiesKey ? studiesKey.split(',') : [],
      support_host: 'https://www.tradingview.com',
    });
    el.appendChild(script);

    return () => {
      el.innerHTML = '';
    };
  }, [symbol, interval, perpetual, studiesKey, theme]);

  return <div ref={ref} className={className || 'tradingview-widget-container h-full w-full'} />;
}

export const TradingViewChart = memo(TradingViewChartImpl);

export const CHART_INTERVALS = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '60', label: '1H' },
  { value: '240', label: '4H' },
  { value: 'D', label: '1D' },
];
