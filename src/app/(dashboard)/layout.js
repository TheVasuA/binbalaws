'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { NotificationProvider } from '@/lib/notify';

export default function DashboardLayout({ children }) {
  const [progressData, setProgressData] = useState(null);

  // Fetch progress data ONCE on initial load
  useEffect(() => {
    const loadProgressData = async () => {
      try {
        const [goalRes, futuresRes] = await Promise.all([
          fetch('/api/compound'),
          fetch('/api/futures?type=positions')
        ]);
        const goalData = await goalRes.json();
        const futuresData = await futuresRes.json();
        
        const currentBalance = (futuresData.account?.totalWalletBalance || 0) + (futuresData.account?.totalUnrealizedProfit || 0);
        const startingBalance = goalData?.startingBalance || futuresData.account?.totalWalletBalance || currentBalance || 1000;
        const completedTrades = goalData?.completedTrades?.length || 0;
        const targetAmount = 100000;

        // Calculate total trades needed
        let balance = startingBalance > 0 ? startingBalance : 1000;
        let totalTrades = 0;
        while (balance < targetAmount && totalTrades < 500) {
          balance *= 1.02;
          totalTrades++;
        }
        
        // Calculate progress based on current balance vs target
        const balanceProgress = Math.min(((currentBalance - startingBalance) / (targetAmount - startingBalance)) * 100, 100);
        const tradesProgress = totalTrades > 0 ? (completedTrades / totalTrades) * 100 : 0;
        
        // Use the higher of the two progress measures
        const displayProgress = Math.max(balanceProgress, tradesProgress, 0);

        console.log('Progress data:', { currentBalance, startingBalance, completedTrades, totalTrades, tradesProgress, balanceProgress, displayProgress });

        setProgressData({
          currentBalance,
          targetAmount,
          completedTrades,
          totalTrades,
          tradesProgress: displayProgress,
          tradesRemaining: totalTrades - completedTrades,
          // Add current milestone info for Navbar
          ...(function getCurrentMilestone() {
            // Reproduce milestone logic
            let milestones = [];
            let bal = startingBalance > 0 ? startingBalance : 1000;
            let tradeNum = 1;
            while (bal < targetAmount && tradeNum <= 500) {
              const profit = bal * 0.02;
              const end = bal + profit;
              milestones.push({ trade: tradeNum, start: bal, profit, end });
              bal = end;
              tradeNum++;
            }
            const current = milestones[completedTrades] || null;
            if (!current) return {};
            return {
              currentTradeNum: current.trade,
              currentTradeStart: current.start,
              currentTradeProfit: current.profit,
              currentTradeEnd: current.end
            };
          })()
        });
      } catch (error) {
        console.error('Failed to load progress data:', error);
      }
    };
    loadProgressData();
  }, []);

  return (
    <NotificationProvider>
      <div className="min-h-screen bg-gray-900">
        <Navbar progressData={progressData} />

        <main>
          {children}
        </main>
      </div>
    </NotificationProvider>
  );
}
