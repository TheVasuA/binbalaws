'use client';

import { useEffect, useMemo, useState } from 'react';

/** Pre-trade checklist — each row must be answered Yes before placing. */
export const PRE_ORDER_CHECKS = [
  { id: 'notRevenge', label: 'This is not a revenge / recovery trade' },
  { id: 'rsiScanner', label: 'Multi RSI & Breakout scanner reviewed' },
  { id: 'timeframes', label: 'All timeframes analysed' },
  { id: 'doublePattern', label: 'Double bottom / double top confirmed' },
  { id: 'tpSl', label: 'Buy / Sell TP/SL conformed to plan' },
];

export default function OrderConfirmModal({
  open,
  onClose,
  onConfirm,
  side = 'BUY',
  symbol = '',
  orderType = 'MARKET',
  summary = '',
  openPositionCount = 0,
  maxOpenPositions = 3,
  confirming = false,
}) {
  const [answers, setAnswers] = useState({});

  useEffect(() => {
    if (!open) return;
    const initial = {};
    PRE_ORDER_CHECKS.forEach((c) => { initial[c.id] = null; });
    setAnswers(initial);
  }, [open]);

  const allYes = useMemo(
    () => PRE_ORDER_CHECKS.every((c) => answers[c.id] === 'yes'),
    [answers],
  );

  const atPositionLimit = maxOpenPositions > 0 && openPositionCount >= maxOpenPositions;

  if (!open) return null;

  const sideLabel = side === 'BUY' ? 'LONG (Buy)' : 'SHORT (Sell)';
  const typeLabel = orderType === 'LIMIT' ? 'Limit' : 'Market';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !confirming) onClose(); }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-orange-500/50 bg-gray-900 shadow-2xl"
        role="dialog"
        aria-labelledby="pre-order-title"
      >
        <div className="border-b border-gray-700 px-4 py-3">
          <p className="text-xs text-orange-400 font-semibold uppercase tracking-wider">Pre-order check</p>
          <h2 id="pre-order-title" className="text-lg font-bold text-white mt-1">
            Confirm {typeLabel} {sideLabel} — {symbol}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Maximum open positions:{' '}
            <span className="text-white font-semibold tabular-nums">{openPositionCount}</span>
            {' / '}
            <span className="text-orange-300 font-semibold tabular-nums">{maxOpenPositions}</span>
            {' '}(editable in Settings)
          </p>
          {summary && <p className="text-sm text-gray-300 mt-2">{summary}</p>}
        </div>

        <div className="px-4 py-3 space-y-3">
          {PRE_ORDER_CHECKS.map((item, idx) => (
            <div
              key={item.id}
              className="rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2.5"
            >
              <p className="text-sm text-gray-200 mb-2">
                <span className="text-gray-500 mr-1">{idx + 1}.</span>
                {item.label}
              </p>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name={`check-${item.id}`}
                    checked={answers[item.id] === 'yes'}
                    onChange={() => setAnswers((prev) => ({ ...prev, [item.id]: 'yes' }))}
                    className="accent-green-500"
                  />
                  <span className="text-green-400 font-medium">Yes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name={`check-${item.id}`}
                    checked={answers[item.id] === 'no'}
                    onChange={() => setAnswers((prev) => ({ ...prev, [item.id]: 'no' }))}
                    className="accent-red-500"
                  />
                  <span className="text-red-400 font-medium">No</span>
                </label>
              </div>
            </div>
          ))}

          <p className="text-center text-sm font-semibold text-yellow-300 border border-yellow-500/30 rounded-lg py-2 bg-yellow-500/10">
            Check twice before placing order
          </p>

          {atPositionLimit && (
            <p className="text-sm text-red-400 text-center">
              You already have {openPositionCount} open positions (max {maxOpenPositions}). Close one before opening another.
            </p>
          )}
          {!allYes && PRE_ORDER_CHECKS.some((c) => answers[c.id] === 'no') && (
            <p className="text-sm text-red-400 text-center">
              Any &quot;No&quot; answer means you should not place this trade. Change answers or cancel.
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-gray-700 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="flex-1 py-2.5 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-50 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming || !allYes || atPositionLimit}
            className={`flex-1 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${
              side === 'BUY' ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'
            }`}
          >
            {confirming ? 'Placing…' : `Place ${side === 'BUY' ? 'Buy' : 'Sell'} order`}
          </button>
        </div>
      </div>
    </div>
  );
}
