'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '@/lib/utils';

export default function GoalTracker({ futuresAccount }) {
  const [completedTrades, setCompletedTrades] = useState([]);
  const [savedStartingBalance, setSavedStartingBalance] = useState(null);
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [targetAmount] = useState(100000); // $100,000 target
  const [profitPercent] = useState(2); // 2% per trade

  const currentBalance = futuresAccount?.totalWalletBalance || 0;

  // Save to database
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

  // Load data from database
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

  // Save starting balance when futures data loads and no saved balance exists
  useEffect(() => {
    if (isDbLoaded && currentBalance > 0 && savedStartingBalance === null) {
      setSavedStartingBalance(currentBalance);
      saveToDatabase(currentBalance, completedTrades);
    }
  }, [currentBalance, savedStartingBalance, isDbLoaded, saveToDatabase, completedTrades]);

  // Starting balance from saved value or current futures balance
  const startingBalance = savedStartingBalance || currentBalance;

  // Generate trade milestones to reach target
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

  // Step back one trade — removes the last completed milestone (use after a loss
  // or a mistaken "mark complete"). Returns to the previous goal step.
  const undoLastTrade = () => {
    if (completedTrades.length === 0) return;
    const newTrades = completedTrades.slice(0, -1);
    setCompletedTrades(newTrades);
    saveToDatabase(startingBalance, newTrades);
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
    <div className="space-y-4">
      {/* Header with Reset */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-white">
            Compound Trading Goal
          </h2>
          <p className="text-gray-400 text-sm">2% profit per trade to $100,000</p>
        </div>
        <div className="flex items-center gap-2">
          {completedCount > 0 && (
            <button
              onClick={undoLastTrade}
              title="Go back one trade (after a loss)"
              className="px-3 py-1.5 bg-yellow-500/20 text-yellow-300 rounded-lg text-sm hover:bg-yellow-500/30 transition-colors"
            >
              ↩ Undo
            </button>
          )}
          <button
            onClick={resetProgress}
            className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            {formatCurrency(currentBalance)}
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
      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
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
        <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-xl p-4 md:p-6 border border-blue-500/50">
          <h3 className="text-lg font-semibold text-white mb-3">
            🎯 Current Trade #{currentMilestone.trade}
          </h3>
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
          <div className="flex gap-2">
            <button
              onClick={() => markTradeComplete(currentMilestone.trade)}
              className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors"
            >
              ✓ Mark Trade #{currentMilestone.trade} Complete
            </button>
            {completedCount > 0 && (
              <button
                onClick={undoLastTrade}
                title={`Undo trade #${completedCount} (go back after a loss)`}
                className="px-4 py-3 bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 hover:bg-yellow-500/30 font-semibold rounded-lg transition-colors"
              >
                ↩ Undo #{completedCount}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Completed Message */}
      {completedCount >= totalTrades && totalTrades > 0 && (
        <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl p-6 border border-green-500/50 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-green-400 mb-2">Goal Achieved!</h2>
          <p className="text-gray-300">
            You&apos;ve reached {formatCurrency(targetAmount)} through compound trading!
          </p>
        </div>
      )}

      {/* Trade Milestones */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">Trade Milestones</h3>
        </div>
        
        <div className="max-h-64 overflow-y-auto">
          {milestones.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              Loading balance data...
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {milestones.slice(0, 20).map((milestone) => (
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
                  {/* Status Icon */}
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

                  {/* Trade Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm">Trade #{milestone.trade}</span>
                      {milestone.completed && (
                        <span className="text-green-400 text-xs">✓</span>
                      )}
                    </div>
                    <div className="text-gray-400 text-xs">
                      {formatCurrency(milestone.startBalance)} → {formatCurrency(milestone.endBalance)}
                    </div>
                  </div>

                  {/* Profit */}
                  <div className="text-right">
                    <div className="text-green-400 font-medium text-sm">
                      +{formatCurrency(milestone.profit)}
                    </div>
                  </div>
                </div>
              ))}
              {milestones.length > 20 && (
                <div className="p-4 text-center text-gray-500 text-sm">
                  +{milestones.length - 20} more trades...
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
