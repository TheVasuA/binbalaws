'use client';

/** Fired when any page places/closes/updates orders — listeners refetch positions. */
export const PORTFOLIO_REFRESH_EVENT = 'bala:portfolio-refresh';
/** Fired when server auto-marked or undid a compound goal from today's PnL. */
export const COMPOUND_REFRESH_EVENT = 'bala:compound-refresh';

/**
 * Ask every mounted `useBackendFuturesStream` (and similar listeners) to pull a
 * fresh snapshot from Binance. Uses a short follow-up poll because SL/TP algo
 * orders can lag the fill by ~1s on Binance's side.
 */
export function requestPortfolioRefresh(detail = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PORTFOLIO_REFRESH_EVENT, { detail }));
}
