'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar({ onRefresh, loading, progressData }) {
      // Mobile trade summary (shown below navbar)
      const MobileTradeSummary = () => (
        progressData?.currentTradeNum ? (
          <div className="md:hidden w-full px-4 py-3 z-30">
            <div className="bg-gray-900/95 border border-blue-500/30 rounded-xl shadow-lg p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[16px] text-blue-400 font-bold">Trade #{progressData.currentTradeNum}</span>
                <span className="ml-auto text-[12px] text-gray-400 font-medium">Current</span>
              </div>
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex flex-row items-center justify-between">
                  <span className="text-[13px] text-gray-300">Start</span>
                  <span className="text-[13px] text-white font-semibold">${progressData.currentTradeStart?.toLocaleString(undefined, {maximumFractionDigits:2})}</span>
                </div>
                <div className="flex flex-row items-center justify-between">
                  <span className="text-[13px] text-gray-300">Target</span>
                  <span className={`text-[13px] font-bold ${progressData.currentTradeProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>${progressData.currentTradeProfit?.toFixed(2)}
                    {typeof progressData.currentTradeProfitPct === 'number' && (
                      <span className="ml-1 text-[12px] font-medium">({progressData.currentTradeProfitPct.toFixed(2)}%)</span>
                    )}
                  </span>
                </div>
                <div className="flex flex-row items-center justify-between">
                  <span className="text-[13px] text-gray-300">End</span>
                  <span className="text-[13px] text-blue-400 font-bold">${progressData.currentTradeEnd?.toLocaleString(undefined, {maximumFractionDigits:2})}</span>
                </div>
              </div>
            </div>
          </div>
        ) : null
      );
    // Extract current milestone info if available
    const currentTradeNum = progressData?.currentTradeNum;
    const currentTradeStart = progressData?.currentTradeStart;
    const currentTradeProfit = progressData?.currentTradeProfit;
    const currentTradeEnd = progressData?.currentTradeEnd;
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Futures' },
    { href: '/signals', label: '📡 Signals' },
    { href: '/new-order', label: 'New Order' },
    { href: '/spot', label: 'Spot' },
    { href: '/compound', label: '🎯 Goal' },
    { href: '/trades', label: '📊 History' },
  ];

  const isActive = (href) => pathname === href;

  return (
    <>
      <nav className="bg-gray-800/80 backdrop-blur-sm border-b border-gray-700 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <span className="text-white font-bold block text-[15px] sm:text-base">Bala Dashboard</span>
            </Link>
            
            {/* Desktop Nav */}
            <div className="hidden sm:flex items-center gap-1">
              {navItems.map((item) => (
                isActive(item.href) ? (
                  <span
                    key={item.href}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg"
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="px-3 py-1.5 text-gray-400 hover:text-white text-sm font-medium rounded-lg hover:bg-gray-700/50 transition-colors"
                  >
                    {item.label}
                  </Link>
                )
              ))}
            </div>
          </div>

          {/* Progress Bar - Compact in header */}
          {progressData && (
            <div className="hidden md:flex items-center gap-2 flex-1 mx-4 px-2 py-1 bg-gray-900/50 rounded-full border border-gray-700/50 min-h-[40px] whitespace-nowrap overflow-x-auto min-w-0">
              <span className="text-[11px] text-white font-bold tabular-nums">{(progressData?.tradesProgress || 0).toFixed(1)}%</span>
              <div className="flex-1 bg-gray-700/80 rounded-full h-2 overflow-hidden shadow-inner relative">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-green-400 rounded-full transition-all duration-700 shadow-lg shadow-purple-500/20"
                  style={{ width: `${Math.max(progressData?.tradesProgress || 0, 1)}%` }}
                />
                <div 
                  className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent rounded-full pointer-events-none"
                />
              </div>
              {/* Current Trade Summary */}
              {currentTradeNum && (
                <div className="flex flex-col md:flex-row items-end md:items-center justify-center gap-1 md:gap-3 min-w-[120px] px-2 border-l border-gray-700/40 flex-shrink-0">
                  <span className="text-[13px] text-blue-400 font-semibold leading-tight md:mr-3">Trade #{currentTradeNum}</span>
                  <span className="text-[12px] text-gray-300 leading-tight md:mr-3">Start: <span className="text-white">${currentTradeStart?.toLocaleString(undefined, {maximumFractionDigits:2})}</span></span>
                  <span className="text-[12px] text-green-400 leading-tight md:mr-3">Target: <span className="font-bold">+${currentTradeProfit?.toLocaleString(undefined, {maximumFractionDigits:2})}</span></span>
                  <span className="text-[12px] text-blue-400 leading-tight">End: <span className="font-bold">${currentTradeEnd?.toLocaleString(undefined, {maximumFractionDigits:2})}</span></span>
                </div>
              )}
              {/* Trades Remaining (RmT) */}
              {typeof progressData?.tradesRemaining === 'number' && (
                <div className="flex items-center gap-1 px-2 border-l border-gray-700/40 flex-shrink-0">
                  <span className="text-[12px] text-yellow-300 font-bold">RmT</span>
                  <span className="text-[12px] text-white font-bold">{progressData.tradesRemaining}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] md:text-[12px] text-gray-300 font-medium">$100K</span>
                <span className="text-[10px] md:text-[12px] text-green-400 font-semibold">🎯</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Refresh Button */}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-50 rounded-lg transition-all"
              >
                <svg className={`w-4 h-4 text-white ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="sm:hidden p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="sm:hidden pb-3 animate-fadeIn">
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                isActive(item.href) ? (
                  <span
                    key={item.href}
                    className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg"
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="px-3 py-2 text-gray-400 hover:text-white text-sm font-medium rounded-lg hover:bg-gray-700/50 transition-colors"
                  >
                    {item.label}
                  </Link>
                )
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
      <MobileTradeSummary />
    </>
  );
}
