'use client';

import { useState, useEffect, useCallback } from 'react';
import { useFetch, formatCurrency } from '@/lib/utils';

export default function CompoundPage() {
  const { data: futuresData, loading: futuresLoading, refetch } = useFetch('/api/futures', { refreshInterval: 5 * 60 * 1000 }); // 5 min
  const [completedTrades, setCompletedTrades] = useState([]);
  const [savedStartingBalance, setSavedStartingBalance] = useState(null);
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [targetAmount] = useState(100000);
  const [profitPercent] = useState(2);

  const currentBalance = futuresData?.account?.totalWalletBalance || 0;

  const saveToDatabase = useCallback(async (balance, trades) => {
    try {
      await fetch('/api/compound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startingBalance: balance,
          completedTrades: trades,
        }),
      });
    } catch (error) {
      console.error('Failed to save compound data:', error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch('/api/compound');
        const data = await res.json();
        if (data.startingBalance && data.startingBalance > 0) {
          setSavedStartingBalance(data.startingBalance);
        }
        if (data.completedTrades && data.completedTrades.length > 0) {
          setCompletedTrades(data.completedTrades);
        }
      } catch (error) {
        console.error('Failed to load compound data:', error);
      } finally {
        setIsDbLoaded(true);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (isDbLoaded && !futuresLoading && currentBalance > 0 && savedStartingBalance === null) {
      setSavedStartingBalance(currentBalance);
      saveToDatabase(currentBalance, completedTrades);
    }
  }, [currentBalance, savedStartingBalance, isDbLoaded, futuresLoading, saveToDatabase, completedTrades]);

  const startingBalance = savedStartingBalance || currentBalance;

  const generateMilestones = () => {
    const milestones = [];
    let balance = startingBalance || currentBalance;
    let tradeNumber = 1;
    
    if (balance <= 0) return milestones;
    
    while (balance < targetAmount && tradeNumber <= 500) {
      const profit = balance * (profitPercent / 100);
      const newBalance = balance + profit;
      
      milestones.push({
        trade: tradeNumber,
        startBalance: balance,
        profit: profit,
        endBalance: newBalance,
        completed: tradeNumber <= completedTrades.length,
        completedAt: completedTrades[tradeNumber - 1]?.completedAt || null,
      });
      
      balance = newBalance;
      tradeNumber++;
    }
    
    return milestones;
  };

  const milestones = generateMilestones();
  const totalTrades = milestones.length;
  const completedCount = completedTrades.length;
  const progressPercent = totalTrades > 0 ? (completedCount / totalTrades) * 100 : 0;

  const markTradeComplete = (tradeNumber) => {
    if (tradeNumber === completedTrades.length + 1) {
      const milestone = milestones[tradeNumber - 1];
      const newTrades = [
        ...completedTrades,
        {
          trade: tradeNumber,
          startBalance: milestone.startBalance,
          endBalance: milestone.endBalance,
          profit: milestone.profit,
          completedAt: new Date().toISOString(),
        },
      ];
      setCompletedTrades(newTrades);
      saveToDatabase(startingBalance, newTrades);
    }
  };

  const resetProgress = async () => {
    if (confirm('Are you sure you want to reset all progress? This will set starting balance to your current futures balance.')) {
      setCompletedTrades([]);
      setSavedStartingBalance(currentBalance);
      await saveToDatabase(currentBalance, []);
    }
  };

  const setStartingBalanceNow = async () => {
    if (currentBalance > 0) {
      setSavedStartingBalance(currentBalance);
      await saveToDatabase(currentBalance, completedTrades);
    } else {
      alert('Futures balance not loaded yet. Please wait and try again.');
    }
  };

  const currentMilestone = milestones[completedCount] || null;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-4 md:py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            Compound Trading Goal
          </h1>
          <p className="text-gray-400 mt-1">2% profit per trade to $100,000</p>
        </div>
        <button
          onClick={resetProgress}
          className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <p className="text-gray-400 text-xs md:text-sm">Starting Balance</p>
          <p className="text-lg md:text-xl font-bold text-white">
            {formatCurrency(startingBalance)}
          </p>
          {startingBalance === 0 && currentBalance > 0 && (
            <button
              onClick={setStartingBalanceNow}
              className="mt-2 text-xs bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded"
            >
              Set to {formatCurrency(currentBalance)}
            </button>
          )}
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <p className="text-gray-400 text-xs md:text-sm">Current Balance</p>
          <p className="text-lg md:text-xl font-bold text-blue-400">
            {futuresLoading ? 'Loading...' : formatCurrency(currentBalance)}
          </p>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <p className="text-gray-400 text-xs md:text-sm">Target</p>
          <p className="text-lg md:text-xl font-bold text-green-400">
            {formatCurrency(targetAmount)}
          </p>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <p className="text-gray-400 text-xs md:text-sm">Trades Remaining</p>
          <p className="text-lg md:text-xl font-bold text-yellow-400">
            {totalTrades - completedCount}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-white font-medium">Progress</span>
          <span className="text-gray-400 text-sm">
            {completedCount} / {totalTrades} trades ({progressPercent.toFixed(1)}%)
          </span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-4">
          <div
            className="bg-gradient-to-r from-blue-500 to-green-500 h-4 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Current Trade */}
      {currentMilestone && (
        <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl p-4 md:p-6 border border-blue-500/50 mb-6">
          <h2 className="text-lg font-semibold text-white mb-3">
            🎯 Current Trade #{currentMilestone.trade}
          </h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-gray-400 text-xs">Start</p>
              <p className="text-white font-medium">{formatCurrency(currentMilestone.startBalance)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Target Profit</p>
              <p className="text-green-400 font-medium">+{formatCurrency(currentMilestone.profit)}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">End Balance</p>
              <p className="text-blue-400 font-medium">{formatCurrency(currentMilestone.endBalance)}</p>
            </div>
          </div>
          <button
            onClick={() => markTradeComplete(currentMilestone.trade)}
            className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors"
          >
            ✓ Mark Trade #{currentMilestone.trade} Complete
          </button>
        </div>
      )}

      {/* Completed Message */}
      {completedCount >= totalTrades && totalTrades > 0 && (
        <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl p-6 border border-green-500/50 mb-6 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-green-400 mb-2">Goal Achieved!</h2>
          <p className="text-gray-300">
            You've reached {formatCurrency(targetAmount)} through compound trading!
          </p>
        </div>
      )}

      {/* Trade Milestones */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Trade Milestones</h2>
        </div>
        
        <div className="max-h-96 overflow-y-auto">
          {milestones.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              Loading balance data...
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {milestones.map((milestone) => (
                <div
                  key={milestone.trade}
                  className={`p-3 md:p-4 flex items-center gap-3 ${
                    milestone.trade === completedCount + 1
                      ? 'bg-blue-500/10'
                      : milestone.completed
                      ? 'bg-green-500/5'
                      : ''
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      milestone.completed
                        ? 'bg-green-500 text-white'
                        : milestone.trade === completedCount + 1
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {milestone.completed ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-sm font-medium">{milestone.trade}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">Trade #{milestone.trade}</span>
                      {milestone.completed && (
                        <span className="text-green-400 text-xs">✓ Completed</span>
                      )}
                    </div>
                    <div className="text-gray-400 text-sm">
                      {formatCurrency(milestone.startBalance)} → {formatCurrency(milestone.endBalance)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-green-400 font-medium">
                      +{formatCurrency(milestone.profit)}
                    </div>
                    <div className="text-gray-500 text-xs">+{profitPercent}%</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 text-center text-gray-500 text-sm">
        <p>Compound formula: Each trade adds {profitPercent}% to your balance</p>
        <p className="mt-1">
          {startingBalance > 0 && (
            <>
              {formatCurrency(startingBalance)} × (1.02)^{totalTrades} = {formatCurrency(targetAmount)}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
