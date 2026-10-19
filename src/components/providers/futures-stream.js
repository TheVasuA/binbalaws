'use client';

import { createContext, useContext, useMemo } from 'react';
import { useBackendFuturesStream } from '@/lib/backendWS';
import { computeDailyRisk } from '@/lib/daily-risk';
import { usePortfolioSettings } from './app-data';

const FuturesStreamContext = createContext(null);

/** One live account/positions stream for the whole dashboard. */
export function FuturesStreamProvider({ children }) {
  const stream = useBackendFuturesStream();
  const settings = usePortfolioSettings();

  const dailyRisk = useMemo(
    () => computeDailyRisk({ account: stream.account, dailyPnl: stream.dailyPnl, settings }),
    [stream.account, stream.dailyPnl, settings],
  );

  const value = useMemo(() => ({ ...stream, dailyRisk }), [stream, dailyRisk]);
  return <FuturesStreamContext.Provider value={value}>{children}</FuturesStreamContext.Provider>;
}

export function useFuturesStream() {
  const ctx = useContext(FuturesStreamContext);
  if (!ctx) throw new Error('useFuturesStream must be used inside FuturesStreamProvider');
  return ctx;
}
