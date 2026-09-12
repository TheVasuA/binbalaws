'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

export default function PortfolioHeader({ totalValue, futuresAccount, lastUpdated, onRefresh, loading }) {
  const [goalData, setGoalData] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const targetAmount = 100000; // $100,000 target

  // Load goal data from database
  useEffect(() => {
    const loadGoalData = async () => {
      try {
        const res = await fetch('/api/compound');
        const data = await res.json();
        setGoalData(data);
      } catch (error) {
        console.error('Failed to load goal data:', error);
      }
    };
    loadGoalData();
  }, []);

  const currentBalance = futuresAccount?.totalWalletBalance || 0;
  const startingBalance = goalData?.startingBalance || currentBalance;
  const completedTrades = goalData?.completedTrades?.length || 0;
  
  // Calculate progress to goal
  const progressPercent = startingBalance > 0 
    ? Math.min(((currentBalance - startingBalance) / (targetAmount - startingBalance)) * 100, 100)
    : 0;
  
  // Calculate total trades needed
  const calculateTotalTrades = () => {
    if (startingBalance <= 0) return 0;
    let balance = startingBalance;
    let trades = 0;
    while (balance < targetAmount && trades < 500) {
      balance *= 1.02; // 2% compound
      trades++;
    }
    return trades;
  };
  
  const totalTrades = calculateTotalTrades();
  const tradesProgress = totalTrades > 0 ? (completedTrades / totalTrades) * 100 : 0;

  return (
    <div className="flex flex-col gap-2 mb-6 md:mb-8">
      {/* Glass Header Card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border border-gray-700/50 shadow-2xl">
        {/* Background Glow Effects */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
        
        {/* Header Content */}
        <div className="relative p-4 md:p-6">
          {/* Title Row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                <svg className="w-5 h-5 md:w-6 md:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <h1
                  className="font-extrabold italic tracking-tight text-4xl md:text-6xl bg-gradient-to-b from-yellow-200 via-amber-400 to-orange-600 bg-clip-text text-transparent select-none leading-none"
                  style={{
                    fontFamily: "'Trebuchet MS', 'Segoe UI', system-ui, sans-serif",
                    filter: "drop-shadow(0 1px 0 rgba(255,255,255,0.35)) drop-shadow(0 3px 2px rgba(0,0,0,0.6)) drop-shadow(0 6px 10px rgba(0,0,0,0.45))",
                  }}
                >
                  10M$
                </h1>
                <p className="text-gray-500 text-xs md:text-sm flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'Live'}
                </p>
              </div>
            </div>
            
            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-2">
              <Link
                href="/compound"
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl text-sm font-medium transition-all hover:scale-105 active:scale-95 shadow-lg shadow-green-500/25"
              >
                🎯 Goal Tracker
              </Link>
              <button
                onClick={onRefresh}
                disabled={loading}
                className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-50 rounded-xl transition-all hover:scale-105 active:scale-95"
              >
                <svg
                  className={`w-5 h-5 text-white ${loading ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
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

          {/* Mobile Menu Dropdown */}
          {menuOpen && (
            <div className="md:hidden mb-4 p-3 bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-700/50 animate-fadeIn">
              <div className="flex flex-col gap-2">
                <Link
                  href="/compound"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-green-600/20 to-emerald-600/20 hover:from-green-600/30 hover:to-emerald-600/30 text-green-400 rounded-xl text-sm font-medium transition-all border border-green-500/20"
                >
                  <span className="text-lg">🎯</span>
                  <div>
                    <p className="font-medium">Goal Tracker</p>
                    <p className="text-xs text-gray-500">Track your $100K journey</p>
                  </div>
                </Link>
                <button
                  onClick={() => { onRefresh(); setMenuOpen(false); }}
                  disabled={loading}
                  className="flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium transition-all border border-white/10 disabled:opacity-50"
                >
                  <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <div className="text-left">
                    <p className="font-medium">Refresh Data</p>
                    <p className="text-xs text-gray-500">Fetch latest prices</p>
                  </div>
                </button>
                <div className="flex gap-2 mt-1">
                  <a
                    href="https://www.binance.com/en/futures"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 rounded-xl text-xs font-medium transition-all border border-yellow-500/20"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0L4.5 7.5l2.625 2.625L12 5.25l4.875 4.875L19.5 7.5 12 0zm0 9.75L7.125 14.625 4.5 12l-2.625 2.625L12 24.75l10.125-10.125L19.5 12l-2.625 2.625L12 9.75z"/>
                    </svg>
                    Binance
                  </a>
                  <button
                    onClick={() => setMenuOpen(false)}
                    className="px-4 py-2 bg-gray-700/50 hover:bg-gray-700 text-gray-400 rounded-xl text-xs font-medium transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Main Balance */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Current Balance</p>
              <p className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-white via-white to-gray-400 bg-clip-text text-transparent">
                {formatCurrency((futuresAccount?.totalWalletBalance || 0) + (futuresAccount?.totalUnrealizedProfit || 0))}
              </p>
              {futuresAccount?.totalUnrealizedProfit !== undefined && (
                <div className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  futuresAccount.totalUnrealizedProfit >= 0 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {futuresAccount.totalUnrealizedProfit >= 0 ? '↑' : '↓'}
                  {futuresAccount.totalUnrealizedProfit >= 0 ? '+' : ''}{formatCurrency(futuresAccount.totalUnrealizedProfit)} unrealized
                </div>
              )}
            </div>

            {/* Goal Target */}
            <div className="text-left md:text-right">
              <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Goal Target</p>
              <p className="text-2xl md:text-3xl font-bold text-transparent bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text">
                {formatCurrency(targetAmount)}
              </p>
              <p className="text-gray-500 text-xs mt-1">
                {completedTrades} of {totalTrades} trades
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/50">
            <div className="flex justify-between items-center text-xs text-gray-400 mb-2">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                Progress to $100K
              </span>
              <span className="font-mono text-white">{tradesProgress.toFixed(1)}%</span>
            </div>
            <div className="relative w-full bg-gray-700/50 rounded-full h-2.5 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${Math.max(tradesProgress, 0)}%` }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
            </div>
            <div className="flex justify-between items-center text-xs mt-2">
              <span className="text-gray-600">Start: {formatCurrency(startingBalance)}</span>
              <Link href="/compound" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
                View Goal →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <div className="group bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-3 md:p-4 border border-gray-700/50 hover:border-blue-500/30 transition-all hover:shadow-lg hover:shadow-blue-500/5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
            </div>
            <p className="text-gray-500 text-xs">Wallet</p>
          </div>
          <p className="text-base md:text-xl font-bold text-white">
            {formatCurrency(futuresAccount?.totalWalletBalance || 0)}
          </p>
        </div>
        
        <div className="group bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-3 md:p-4 border border-gray-700/50 hover:border-purple-500/30 transition-all hover:shadow-lg hover:shadow-purple-500/5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-3 h-3 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm2.5 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm6.207.293a1 1 0 00-1.414 0l-6 6a1 1 0 101.414 1.414l6-6a1 1 0 000-1.414zM12.5 10a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-gray-500 text-xs">Margin</p>
          </div>
          <p className="text-base md:text-xl font-bold text-white">
            {formatCurrency(futuresAccount?.availableBalance || 0)}
          </p>
        </div>
        
        <div className="group bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-3 md:p-4 border border-gray-700/50 hover:border-green-500/30 transition-all hover:shadow-lg hover:shadow-green-500/5">
          <div className="flex items-center gap-2 mb-1">
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
              (futuresAccount?.totalUnrealizedProfit || 0) >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'
            }`}>
              <svg className={`w-3 h-3 ${(futuresAccount?.totalUnrealizedProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`} fill="currentColor" viewBox="0 0 20 20">
                {(futuresAccount?.totalUnrealizedProfit || 0) >= 0 
                  ? <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
                  : <path fillRule="evenodd" d="M12 13a1 1 0 100 2h5a1 1 0 001-1V9a1 1 0 10-2 0v2.586l-4.293-4.293a1 1 0 00-1.414 0L8 9.586 3.707 5.293a1 1 0 00-1.414 1.414l5 5a1 1 0 001.414 0L11 9.414 14.586 13H12z" clipRule="evenodd" />
                }
              </svg>
            </div>
            <p className="text-gray-500 text-xs">PnL</p>
          </div>
          <p className={`text-base md:text-xl font-bold ${(futuresAccount?.totalUnrealizedProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {(futuresAccount?.totalUnrealizedProfit || 0) >= 0 ? '+' : ''}{formatCurrency(futuresAccount?.totalUnrealizedProfit || 0)}
          </p>
        </div>
      </div>
    </div>
  );
}
