'use client';

import { useFetch, formatCurrency } from '@/lib/utils';

export default function TradesHistory() {
  const { data: trades, loading, error } = useFetch('/api/trades?type=pnl&limit=10'); // no auto-refresh

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // PnL stats
  const totalPnL = trades?.reduce((sum, t) => sum + t.income, 0) || 0;
  const winCount = trades?.filter(t => t.income > 0).length || 0;
  const lossCount = trades?.filter(t => t.income < 0).length || 0;
  const winRate = trades?.length > 0 ? ((winCount / trades.length) * 100).toFixed(1) : 0;
  const totalLoss = trades?.filter(t => t.income < 0).reduce((sum, t) => sum + t.income, 0) || 0;
  const totalProfit = trades?.filter(t => t.income > 0).reduce((sum, t) => sum + t.income, 0) || 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg md:text-xl font-semibold text-white">Trade History</h2>
        <p className="text-gray-400 text-sm">Last 10 closed positions (Realized PnL)</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <p className="text-gray-400 text-xs md:text-sm">Total PnL</p>
          <p className={`text-lg md:text-xl font-bold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
          </p>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <p className="text-gray-400 text-xs md:text-sm">Cumulative Profit</p>
          <p className="text-lg md:text-xl font-bold text-green-400">
            +{formatCurrency(totalProfit)}
          </p>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <p className="text-gray-400 text-xs md:text-sm">Cumulative Loss</p>
          <p className="text-lg md:text-xl font-bold text-red-400">
            {formatCurrency(totalLoss)}
          </p>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <p className="text-gray-400 text-xs md:text-sm">Win Rate</p>
          <p className="text-lg md:text-xl font-bold text-blue-400">
            {winRate}%
          </p>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <p className="text-gray-400 text-xs md:text-sm">Wins</p>
          <p className="text-lg md:text-xl font-bold text-green-400">
            {winCount}
          </p>
        </div>
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <p className="text-gray-400 text-xs md:text-sm">Losses</p>
          <p className="text-lg md:text-xl font-bold text-red-400">
            {lossCount}
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-400">Error: {error}</p>
        </div>
      )}

      {/* Trades List */}
      {!loading && trades && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold text-white">Realized PnL History</h3>
          </div>

          {trades.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No trade history found
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="block md:hidden divide-y divide-gray-700">
                {trades.map((trade, index) => (
                  <div key={trade.id || index} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">{trade.symbol}</span>
                      <span className={`font-bold ${trade.income >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.income >= 0 ? '+' : ''}{formatCurrency(trade.income)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">{formatDate(trade.timestamp)}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        trade.income >= 0 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {trade.income >= 0 ? 'WIN' : 'LOSS'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">#</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Symbol</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Date</th>
                      <th className="text-right py-3 px-4 text-gray-400 font-medium">Realized PnL</th>
                      <th className="text-center py-3 px-4 text-gray-400 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade, index) => (
                      <tr 
                        key={trade.id || index} 
                        className="border-b border-gray-700/50 hover:bg-gray-700/30"
                      >
                        <td className="py-4 px-4 text-gray-500">{index + 1}</td>
                        <td className="py-4 px-4 text-white font-medium">{trade.symbol}</td>
                        <td className="py-4 px-4 text-gray-400">{formatDate(trade.timestamp)}</td>
                        <td className={`py-4 px-4 text-right font-bold ${
                          trade.income >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {trade.income >= 0 ? '+' : ''}{formatCurrency(trade.income)}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            trade.income >= 0 
                              ? 'bg-green-500/20 text-green-400' 
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {trade.income >= 0 ? '✓ WIN' : '✗ LOSS'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-gray-500 text-sm">
        <p>Showing last 10 closed positions</p>
      </div>
    </div>
  );
}
