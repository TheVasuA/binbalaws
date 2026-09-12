
'use client';

import { useState, Fragment } from 'react';
import { formatCurrency, formatCurrencyFull, formatPercent, getChangeColor } from '@/lib/utils';

// Whole-dollar formatting for SL / Target risk values (no decimals).
function formatRiskValueRounded(value) {
  if (value === undefined || value === null) return '0';
  const rounded = Math.round(Math.abs(Number(value)));
  if (!Number.isFinite(rounded)) return '0';
  return rounded.toLocaleString('en-US');
}

// Accept pendingOrders prop
export default function FuturesPositions({ positions, onRefresh, pendingOrders = [] }) {
  const [closing, setClosing] = useState(null);
  const [partialCloseSymbol, setPartialCloseSymbol] = useState(null);
  const [partialClosePct, setPartialClosePct] = useState(25);
  const [partialSubmitting, setPartialSubmitting] = useState(false);
  const [partialError, setPartialError] = useState('');
  const [editRiskSymbol, setEditRiskSymbol] = useState(null);
  const [editSLUsdt, setEditSLUsdt] = useState('');
  const [editTPUsdt, setEditTPUsdt] = useState('');
  const [editRiskSubmitting, setEditRiskSubmitting] = useState(false);
  const [editRiskError, setEditRiskError] = useState('');

  const openEditRisk = (position) => {
    setEditRiskSymbol(position.symbol);
    setEditSLUsdt(position.stopLossValue ? Math.abs(Number(position.stopLossValue)).toFixed(2) : '');
    setEditTPUsdt(position.takeProfitValue ? Math.abs(Number(position.takeProfitValue)).toFixed(2) : '');
    setEditRiskError('');
  };

  const cancelEditRisk = () => {
    setEditRiskSymbol(null);
    setEditRiskError('');
  };

  const handleSaveRisk = async (position) => {
    const qty = Math.abs(parseFloat(position.positionAmt));
    const entry = parseFloat(position.entryPrice);
    if (!qty || !entry) return;

    const slUsdt = parseFloat(editSLUsdt);
    const tpUsdt = parseFloat(editTPUsdt);

    let slPrice = null;
    let tpPrice = null;

    if (editSLUsdt !== '' && !isNaN(slUsdt) && slUsdt > 0) {
      slPrice = position.side === 'LONG'
        ? entry - slUsdt / qty
        : entry + slUsdt / qty;
      if (slPrice <= 0) {
        setEditRiskError('Stop loss USDT value is too large for this position.');
        return;
      }
    }

    if (editTPUsdt !== '' && !isNaN(tpUsdt) && tpUsdt > 0) {
      tpPrice = position.side === 'LONG'
        ? entry + tpUsdt / qty
        : entry - tpUsdt / qty;
      if (tpPrice <= 0) {
        setEditRiskError('Target USDT value is too large for this position.');
        return;
      }
    }

    setEditRiskSubmitting(true);
    setEditRiskError('');
    try {
      const res = await fetch('/api/futures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateRisk',
          symbol: position.symbol,
          side: position.side,
          stopLossPrice: slPrice,
          takeProfitPrice: tpPrice,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update risk');
      setEditRiskSymbol(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      setEditRiskError(err.message);
    } finally {
      setEditRiskSubmitting(false);
    }
  };

  const openPartialClose = (symbol) => {
    setPartialCloseSymbol(symbol);
    setPartialClosePct(25);
    setPartialError('');
  };

  const cancelPartialClose = () => {
    setPartialCloseSymbol(null);
    setPartialError('');
  };

  const handlePartialClose = async (position) => {
    const totalQty = Math.abs(parseFloat(position.positionAmt));
    const closeQty = parseFloat(((totalQty * partialClosePct) / 100).toFixed(8));
    if (closeQty <= 0) return;

    setPartialSubmitting(true);
    setPartialError('');
    try {
      const response = await fetch('/api/futures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'closePosition',
          symbol: position.symbol,
          side: position.side,
          quantity: closeQty,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to close position');
      setPartialCloseSymbol(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      setPartialError(err.message);
    } finally {
      setPartialSubmitting(false);
    }
  };

  const handleForceClose = async (position) => {
    if (!confirm(`Are you sure you want to force close ${position.symbol} ${position.side} position?`)) {
      return;
    }

    setClosing(position.symbol);
    try {
      const response = await fetch('/api/futures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'closePosition',
          symbol: position.symbol,
          side: position.side,
          quantity: Math.abs(parseFloat(position.positionAmt)),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to close position');
      }

      alert(`Position closed successfully!`);
      if (onRefresh) onRefresh();
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setClosing(null);
    }
  };

  if ((!positions || positions.length === 0) && (!pendingOrders || pendingOrders.length === 0)) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        No open futures positions or pending limit orders
      </div>
    );
  }
      {/* Pending Limit Orders - Mobile Card View */}
      {pendingOrders.length > 0 && (
        <div className="block md:hidden space-y-4 mt-6">
          {pendingOrders.map((order, idx) => (
            <div key={`pending-mobile-${order.orderId || idx}`} className="bg-gray-900 rounded-lg p-4 border border-yellow-700">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-yellow-400" />
                <span className="font-medium text-yellow-300 text-lg">{order.symbol}</span>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-400">Pending</span>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-400">Limit</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-400">Side</span>
                  <p className="text-white">{order.side}</p>
                </div>
                <div>
                  <span className="text-gray-400">Price</span>
                  <p className="text-white">{formatCurrency(order.price)}</p>
                </div>
                <div>
                  <span className="text-gray-400">Quantity</span>
                  <p className="text-white">{order.origQty}</p>
                </div>
                <div>
                  <span className="text-gray-400">Status</span>
                  <p className="text-white">{order.status}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
            {/* Pending Limit Orders - Desktop Table View */}
            {pendingOrders.length > 0 && (
              <tr className="bg-yellow-900">
                <td colSpan="10" className="py-2 px-4 text-yellow-300 font-bold text-left border-t border-yellow-700">
                  Pending Limit Orders
                </td>
              </tr>
            )}
            {pendingOrders.length > 0 && pendingOrders.map((order, idx) => (
              <tr key={`pending-desktop-${order.orderId || idx}`} className="border-b border-yellow-700 bg-yellow-900/30">
                <td className="py-2 px-3 text-right text-yellow-200">-</td>
                <td className="py-2 px-3 text-right text-yellow-200">-</td>
                <td className="py-2 px-3 text-right text-yellow-200">-</td>
                <td className="py-2 px-3 text-right text-yellow-200">-</td>
                <td className="py-2 px-3 text-right text-yellow-200">-</td>
                <td className="py-2 px-3 text-center">
                  <span className="px-2 py-1 rounded text-xs font-semibold bg-blue-500/20 text-blue-400">Limit</span>
                </td>
                <td className="border-l border-yellow-700 py-2 px-3 text-shadow-lg/30">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-yellow-400" />
                    <span className="font-medium text-yellow-300 text-lg">{order.symbol.replace(/USDT$/, '')}</span>
                  </div>
                </td>
                <td className="border-l border-yellow-700 py-2 px-3 text-right font-bold font-medium font-mono text-shadow-2xs text-shadow-gray-600 text-yellow-300">
                  <div>{order.side}</div>
                </td>
                <td className="border-l border-yellow-700 py-2 px-3 text-right text-yellow-200">
                  {formatCurrency(order.price)}
                </td>
                <td className="py-2 px-2 text-center">
                  <span className="px-2 py-1 rounded text-xs font-semibold bg-yellow-500/20 text-yellow-400">Pending</span>
                </td>
              </tr>
            ))}

  // Sort positions by total USDT size (desc)
  const sortedPositions = [...positions].sort((a, b) => {
    const aSize = Math.abs(a.positionAmt * a.entryPrice);
    const bSize = Math.abs(b.positionAmt * b.entryPrice);
    return bSize - aSize;
  });

  return (
    <>
      {/* Mobile Card View */}
      <div className="block md:hidden space-y-3">
        {sortedPositions.map((position, index) => (
          <div 
            key={`mobile-${position.symbol}-${index}`}
            className="bg-gray-800 rounded-lg p-3 border border-gray-700"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${position.side === 'LONG' ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-medium text-white text-lg">{position.symbol}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                  position.side === 'LONG' 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {position.side}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                  position.leverage >= 20 ? 'bg-red-500/20 text-red-400' :
                  position.leverage >= 10 ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-blue-500/20 text-blue-400'
                }`}>
                  {position.leverage}x
                </span>
              </div>
              <button
                onClick={() => handleForceClose(position)}
                disabled={closing === position.symbol}
                className="p-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded transition-colors"
                title="Force Close"
              >
                {closing === position.symbol ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-400">Size</span>
                <p className="text-white">{position.positionAmt}</p>
              </div>
              <div>
                <span className="text-gray-400">Entry</span>
                <p className="text-white">
                  {formatCurrencyFull(position.entryPrice)}
                  <span className="text-xs text-blue-400 ml-2">(
                    ${Math.round(Math.abs(position.positionAmt * position.entryPrice)).toLocaleString('en-US')}
                  )</span>
                </p>
              </div>
              <div>
                <span className="text-gray-400">Target</span>
                {position.takeProfitPrice ? (
                  <p className="text-green-400">
                    {formatRiskValueRounded(position.takeProfitValue)}
                    <span className="text-green-400 text-xs ml-1">({formatCurrencyFull(position.takeProfitPrice)})</span>
                  </p>
                ) : (
                  <p className="text-gray-500">No Target</p>
                )}
              </div>
              <div>
                <span className="text-gray-400">Mark</span>
                <p className="text-white">{formatCurrencyFull(position.markPrice)}</p>
              </div>
              <div>
                <span className="text-gray-400">PnL</span>
                <p className={`font-medium ${getChangeColor(position.unrealizedProfit)}`}>
                  {formatCurrency(Number(position.unrealizedProfit).toFixed(2), 2)} ({formatPercent(Number(position.roe).toFixed(2), 2)})
                </p>
              </div>
              <div>
                <span className="text-gray-400">Stop Loss</span>
                {position.stopLossPrice ? (
                    <p className={
                      position.stopLossPrice > position.entryPrice
                        ? "text-green-400"
                        : "text-yellow-400"
                    }>
                      {formatRiskValueRounded(position.stopLossValue)}
                      <span className={
                        position.stopLossPrice > position.entryPrice
                          ? "text-green-400 text-xs ml-1"
                          : "text-red-400 text-xs ml-1"
                      }>
                        ({formatCurrencyFull(position.stopLossPrice)})
                      </span>
                    </p>
                  ) : (
                    <p className="text-gray-500">No SL</p>
                  )}
              </div>
              <div>
                <span className="text-gray-400">Liq. Price</span>
                <p className="text-orange-400">{formatCurrencyFull(position.liquidationPrice)}</p>
              </div>
              <button
                onClick={() => openPartialClose(position.symbol)}
                disabled={closing === position.symbol}
                className="mt-2 w-full py-1 rounded-md text-xs border border-blue-600 text-blue-300 bg-blue-900/30 hover:bg-blue-800/50 transition-colors"
              >
                Partial Close
              </button>
              <button
                onClick={() => editRiskSymbol === position.symbol ? cancelEditRisk() : openEditRisk(position)}
                className="mt-1 w-full py-1 rounded-md text-xs border border-orange-600 text-orange-300 bg-orange-900/30 hover:bg-orange-800/50 transition-colors"
              >
                {editRiskSymbol === position.symbol ? 'Cancel Edit' : 'Edit SL / Target'}
              </button>

              {editRiskSymbol === position.symbol && (
                <div className="mt-2 rounded-lg border border-orange-500/40 bg-gray-900 p-3 space-y-2">
                  <p className="text-xs text-gray-400 font-semibold">Edit SL / Target (USDT risk amount)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-red-400 block mb-0.5">Stop Loss (USDT)</label>
                      <input
                        type="number" min="0" step="0.01" placeholder="e.g. 50"
                        value={editSLUsdt}
                        onChange={(e) => setEditSLUsdt(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-red-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-green-400 block mb-0.5">Target (USDT)</label>
                      <input
                        type="number" min="0" step="0.01" placeholder="e.g. 100"
                        value={editTPUsdt}
                        onChange={(e) => setEditTPUsdt(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-green-500"
                      />
                    </div>
                  </div>
                  {editSLUsdt && !isNaN(parseFloat(editSLUsdt)) && parseFloat(editSLUsdt) > 0 && (
                    <p className="text-[10px] text-red-300">
                      SL Price ≈ {position.side === 'LONG'
                        ? (parseFloat(position.entryPrice) - parseFloat(editSLUsdt) / Math.abs(parseFloat(position.positionAmt))).toFixed(4)
                        : (parseFloat(position.entryPrice) + parseFloat(editSLUsdt) / Math.abs(parseFloat(position.positionAmt))).toFixed(4)}
                    </p>
                  )}
                  {editTPUsdt && !isNaN(parseFloat(editTPUsdt)) && parseFloat(editTPUsdt) > 0 && (
                    <p className="text-[10px] text-green-300">
                      Target Price ≈ {position.side === 'LONG'
                        ? (parseFloat(position.entryPrice) + parseFloat(editTPUsdt) / Math.abs(parseFloat(position.positionAmt))).toFixed(4)
                        : (parseFloat(position.entryPrice) - parseFloat(editTPUsdt) / Math.abs(parseFloat(position.positionAmt))).toFixed(4)}
                    </p>
                  )}
                  {editRiskError && <p className="text-xs text-red-400">{editRiskError}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => handleSaveRisk(position)} disabled={editRiskSubmitting}
                      className="flex-1 py-1.5 rounded text-xs font-semibold bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white">
                      {editRiskSubmitting ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={cancelEditRisk} disabled={editRiskSubmitting}
                      className="px-3 py-1.5 rounded text-xs border border-gray-600 text-gray-300 hover:bg-gray-800">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {partialCloseSymbol === position.symbol && (() => {
                const closeQty = (Math.abs(parseFloat(position.positionAmt)) * partialClosePct) / 100;
                const pnl = position.side === 'LONG'
                  ? (parseFloat(position.markPrice) - parseFloat(position.entryPrice)) * closeQty
                  : (parseFloat(position.entryPrice) - parseFloat(position.markPrice)) * closeQty;
                return (
                <div className="mt-2 rounded-lg border border-blue-500/40 bg-gray-900 p-3 space-y-2">
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Close {partialClosePct}% of position</span>
                    <span className="text-white font-medium">
                      {closeQty.toFixed(4)} / {Math.abs(parseFloat(position.positionAmt))}
                    </span>
                  </div>
                  <input
                    type="range" min="1" max="100" step="1"
                    value={partialClosePct}
                    onChange={(e) => setPartialClosePct(Number(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                  <div className="grid grid-cols-4 gap-1">
                    {[25, 50, 75, 100].map((p) => (
                      <button key={p} type="button" onClick={() => setPartialClosePct(p)}
                        className={`py-1 rounded text-xs border transition-colors ${
                          partialClosePct === p ? 'border-blue-500 text-blue-300 bg-blue-500/20' : 'border-gray-600 text-gray-300 bg-gray-800'
                        }`}>{p}%</button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between rounded bg-gray-800 px-3 py-1.5">
                    <span className="text-[11px] text-gray-400">Realised PnL</span>
                    <span className={`text-sm font-bold ${ pnl >= 0 ? 'text-green-400' : 'text-red-400' }`}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} USDT
                    </span>
                  </div>
                  {partialError && <p className="text-xs text-red-400">{partialError}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => handlePartialClose(position)} disabled={partialSubmitting}
                      className="flex-1 py-1.5 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white">
                      {partialSubmitting ? 'Closing...' : `Close ${partialClosePct}%`}
                    </button>
                    <button onClick={cancelPartialClose} disabled={partialSubmitting}
                      className="px-3 py-1.5 rounded text-xs border border-gray-600 text-gray-300 hover:bg-gray-800">
                      Cancel
                    </button>
                  </div>
                </div>
                );
              })()}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-right py-2 px-3 text-gray-400 font-medium text-sm">Entry Price</th>
              <th className="text-right py-2 px-3 text-gray-400 font-medium text-sm">Mark Price</th>
              <th className="text-right py-2 px-3 text-gray-400 font-medium text-sm">Target</th>
              <th className="text-right py-2 px-3 text-gray-400 font-medium text-sm">Stop Loss</th>
              <th className="text-right py-2 px-3 text-gray-400 font-medium text-sm">Liq. Price</th>
              <th className="text-center py-2 px-3 text-gray-400 font-medium text-sm">Leverage</th>
              <th className="border-l border-gray-700 text-left py-2 px-3 text-gray-400 font-medium text-sm">Symbol</th>
              <th className=" text-right py-2 px-3 text-gray-400 font-medium text-sm">PnL</th>
              <th className=" text-right py-2 px-3 text-gray-400 font-medium text-sm">USDT</th>
              <th className="text-center py-2 px-2 text-gray-400 font-medium text-sm"></th>
            </tr>
          </thead>
          <tbody>
            {sortedPositions.map((position, index) => (
              <Fragment key={`${position.symbol}-${index}`}>
              <tr 
                className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors"
              >
                <td className="py-2 px-3 text-right text-gray-300">
                  {formatCurrency(position.entryPrice, 4).replace('$', '')}
                </td>
                <td className="py-2 px-3 text-right text-gray-300">
                  {formatCurrency(position.markPrice, 4).replace('$', '')}
                </td>
                <td className="py-2 px-3 text-right">
                  {position.takeProfitPrice ? (
                    <div>
                      <div className=" text-green-500 font-medium text-md ">
                        {formatRiskValueRounded(position.takeProfitValue)}
                      </div>
                      <div className="text-gray-300 text-xs flex items-center justify-end">
                        <span>{formatCurrency(position.takeProfitPrice, 4).replace('$', '')}</span>
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-500 text-sm">No Target</span>
                  )}
                </td>
                <td className="py-2 px-3 text-right">
                  {position.stopLossPrice ? (
                      <div>
                        <div className={
                          position.side === 'SHORT'
                            ? (position.stopLossPrice > position.entryPrice
                                ? "text-red-500 text-md font-medium"
                                : "text-green-400 text-md font-medium")
                            : (position.stopLossPrice > position.entryPrice
                                ? "text-green-400 text-md font-medium"
                                : "text-red-500 text-md font-medium")
                        }>
                          {formatRiskValueRounded(position.stopLossValue)}
                        </div>
                        <div className={ "text-gray-300 text-xs flex items-center justify-end"
                        }>
                          <span>{formatCurrency(position.stopLossPrice, 4).replace('$', '')}</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-500 text-sm">No SL</span>
                    )}
                </td>
                <td className="py-2 px-3 text-right text-blue-400">
                  {formatCurrency(position.liquidationPrice, 4).replace('$', '')}
                </td>
                <td className="py-2 px-3 text-center">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    position.leverage >= 20 ? 'bg-red-500/20 text-red-400' :
                    position.leverage >= 10 ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {position.leverage}x
                  </span>
                </td>
                <td className="border-l border-gray-700 py-2 px-3 text-shadow-lg/30">
                  <div className="flex items-center gap-2 ">
                    <div className={`w-2 h-2 rounded-full ${position.side === 'LONG' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="font-medium text-yellow-400 text-lg">{position.symbol.replace(/USDT$/, '')}</span>
                  </div>
                </td>
                <td className={`text-lg border-l border-gray-700 py-2 px-3 text-right font-bold font-medium font-mono text-shadow-2xs text-shadow-gray-600 ${getChangeColor(position.unrealizedProfit)}`}> 
                  <div>₹{Math.round(Math.abs(Number(position.unrealizedProfit) * 100)).toLocaleString('en-IN')}</div>
                  <div className="text-sm opacity-40">
                    {Number(position.roe).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                  </div>
                </td>
                <td className="border-l border-gray-700 py-2 px-3 text-right text-orange-200 ">
                  {(() => {
                    const value = Math.round(Math.abs(position.positionAmt * position.entryPrice));
                    if (value >= 1000) {
                      return (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1) + 'k';
                    }
                    return value;
                  })()}
                </td>
                <td className="py-2 px-2 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => handleForceClose(position)}
                      disabled={closing === position.symbol}
                      className="p-0.4 bg-gray-200 hover:bg-gray-300 disabled:bg-gray-400 text-blue-800 rounded transition-colors border border-gray-400"
                      title="Force Close"
                  >
                    {closing === position.symbol ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => partialCloseSymbol === position.symbol ? cancelPartialClose() : openPartialClose(position.symbol)}
                    disabled={closing === position.symbol}
                    className="px-1.5 py-0.5 text-[10px] rounded border border-blue-600 text-blue-300 bg-blue-900/30 hover:bg-blue-800/50 transition-colors whitespace-nowrap"
                  >
                    {partialCloseSymbol === position.symbol ? 'Cancel' : 'Partial'}
                  </button>
                  <button
                    onClick={() => editRiskSymbol === position.symbol ? cancelEditRisk() : openEditRisk(position)}
                    disabled={closing === position.symbol}
                    className="px-1.5 py-0.5 text-[10px] rounded border border-orange-600 text-orange-300 bg-orange-900/30 hover:bg-orange-800/50 transition-colors whitespace-nowrap"
                  >
                    {editRiskSymbol === position.symbol ? 'Cancel' : 'SL/TP'}
                  </button>
                  </div>
                </td>
              </tr>
              {editRiskSymbol === position.symbol && (
                <tr className="border-b border-orange-500/30 bg-orange-950/40">
                  <td colSpan="10" className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs text-orange-300 font-semibold whitespace-nowrap">Edit SL / Target (USDT)</span>
                      <div className="flex items-center gap-1.5">
                        <label className="text-[10px] text-red-400">SL:</label>
                        <input
                          type="number" min="0" step="0.01" placeholder="USDT"
                          value={editSLUsdt}
                          onChange={(e) => setEditSLUsdt(e.target.value)}
                          className="w-24 bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:border-red-500"
                        />
                        {editSLUsdt && !isNaN(parseFloat(editSLUsdt)) && parseFloat(editSLUsdt) > 0 && (
                          <span className="text-[10px] text-red-300">
                            ≈ {position.side === 'LONG'
                              ? (parseFloat(position.entryPrice) - parseFloat(editSLUsdt) / Math.abs(parseFloat(position.positionAmt))).toFixed(4)
                              : (parseFloat(position.entryPrice) + parseFloat(editSLUsdt) / Math.abs(parseFloat(position.positionAmt))).toFixed(4)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <label className="text-[10px] text-green-400">Target:</label>
                        <input
                          type="number" min="0" step="0.01" placeholder="USDT"
                          value={editTPUsdt}
                          onChange={(e) => setEditTPUsdt(e.target.value)}
                          className="w-24 bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:border-green-500"
                        />
                        {editTPUsdt && !isNaN(parseFloat(editTPUsdt)) && parseFloat(editTPUsdt) > 0 && (
                          <span className="text-[10px] text-green-300">
                            ≈ {position.side === 'LONG'
                              ? (parseFloat(position.entryPrice) + parseFloat(editTPUsdt) / Math.abs(parseFloat(position.positionAmt))).toFixed(4)
                              : (parseFloat(position.entryPrice) - parseFloat(editTPUsdt) / Math.abs(parseFloat(position.positionAmt))).toFixed(4)}
                          </span>
                        )}
                      </div>
                      {editRiskError && <span className="text-xs text-red-400">{editRiskError}</span>}
                      <button onClick={() => handleSaveRisk(position)} disabled={editRiskSubmitting}
                        className="ml-auto px-3 py-1 rounded text-xs font-semibold bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white">
                        {editRiskSubmitting ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {partialCloseSymbol === position.symbol && (() => {
                const closeQty = (Math.abs(parseFloat(position.positionAmt)) * partialClosePct) / 100;
                const pnl = position.side === 'LONG'
                  ? (parseFloat(position.markPrice) - parseFloat(position.entryPrice)) * closeQty
                  : (parseFloat(position.entryPrice) - parseFloat(position.markPrice)) * closeQty;
                return (
                <tr className="border-b border-blue-500/30 bg-blue-950/40">
                  <td colSpan="10" className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs text-gray-400 whitespace-nowrap">Close</span>
                      <input
                        type="range" min="1" max="100" step="1"
                        value={partialClosePct}
                        onChange={(e) => setPartialClosePct(Number(e.target.value))}
                        className="w-32 accent-blue-500 cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-blue-300 w-10">{partialClosePct}%</span>
                      <div className="flex gap-1">
                        {[25, 50, 75, 100].map((p) => (
                          <button key={p} type="button" onClick={() => setPartialClosePct(p)}
                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                              partialClosePct === p ? 'border-blue-500 text-blue-300 bg-blue-500/20' : 'border-gray-600 text-gray-400 bg-gray-800'
                            }`}>{p}%</button>
                        ))}
                      </div>
                      <span className="text-xs text-gray-500">
                        {closeQty.toFixed(4)} of {Math.abs(parseFloat(position.positionAmt))} contracts
                      </span>
                      <span className={`text-sm font-bold ${ pnl >= 0 ? 'text-green-400' : 'text-red-400' }`}>
                        PnL: {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)} USDT
                      </span>
                      {partialError && <span className="text-xs text-red-400">{partialError}</span>}
                      <button onClick={() => handlePartialClose(position)} disabled={partialSubmitting}
                        className="ml-auto px-3 py-1 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white">
                        {partialSubmitting ? 'Closing...' : `Close ${partialClosePct}%`}
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })()}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {/* Open Entry Orders - Desktop Table View */}
      {pendingOrders && pendingOrders.length > 0 && pendingOrders.filter(order => order.type?.toUpperCase() === 'LIMIT').length > 0 && (
        <div className="hidden md:block overflow-x-auto mt-2">
          <table className="w-full">
            <thead>
              <tr className="border-b border-blue-700">
                <th className="text-left py-2 px-3 text-blue-400 font-medium text-sm">Symbol</th>
                <th className="text-left py-2 px-3 text-blue-400 font-medium text-sm">Position Value</th>
                <th className="text-left py-2 px-3 text-blue-400 font-medium text-sm">Entry Price</th>
                <th className="text-left py-2 px-3 text-blue-400 font-medium text-sm">Force Close</th>
              </tr>
            </thead>
            <tbody>
              {pendingOrders.filter(order => order.type?.toUpperCase() === 'LIMIT').map((order, idx) => (
                <tr key={`open-entry-${order.orderId || idx}`} className="border-b border-blue-700 bg-blue-900/30">
                  <td className="py-2 px-3 text-blue-200">
                    {order.symbol}
                    <span className={`ml-2 px-2 py-0.5 rounded text-md font-semibold ${order.side === 'buy' ?   'bg-green-500/20 text-green-400':'bg-red-500/20 text-red-400'}`}>{order.side}</span>
                  </td>
                  <td className="py-2 px-3 text-blue-200">{(order.amount * order.price).toLocaleString('en-US', { maximumFractionDigits: 8 })}</td>
                  <td className="py-2 px-3 text-blue-200">{order.price}</td>
                  <td className="py-2 px-3 text-blue-200">
                    <button
                      className="bg-red-400 hover:bg-red-600 text-white rounded px-2 py-1 text-xs"
                      onClick={() => handleForceClose(order)}
                    >X</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
    </>
  );
}
/// Desktop Table View for Open Entry Orders (Pending Limit Orders)