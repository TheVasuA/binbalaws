'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFetch, formatCurrency, formatNumber } from '@/lib/utils';

const CHART_TIMEFRAMES = [
  { label: '1m', value: '1' },
  { label: '5m', value: '5' },
  { label: '15m', value: '15' },
  { label: '1hr', value: '60' },
  { label: '4hr', value: '240' },
  { label: '1d', value: 'D' },
  { label: '3d', value: '3D' },
];
const REFRESH_INTERVAL_MS = 3 * 60 * 1000;

function normalizeOrderQuantity(rawQty, symbolInfo) {
  let quantity = Number(rawQty);
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;

  const stepSize = Number(symbolInfo?.stepSize);
  if (Number.isFinite(stepSize) && stepSize > 0) {
    quantity = Math.floor(quantity / stepSize) * stepSize;
  }

  const quantityPrecision = symbolInfo?.quantityPrecision ?? 3;
  return Number(quantity.toFixed(quantityPrecision));
}

function getSafePricePrecision(symbolInfo) {
  const parsed = parseInt(symbolInfo?.pricePrecision, 10);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(Math.max(parsed, 0), 8);
}

function computeTriggerPriceFromUsdt({ riskUsdt, side, quantity, markPrice, type }) {
  const pnlUsdt = Number(riskUsdt);
  const qty = Number(quantity);
  const price = Number(markPrice);
  const normalizedSide = String(side || '').toUpperCase();

  if (
    !Number.isFinite(pnlUsdt) ||
    pnlUsdt <= 0 ||
    !Number.isFinite(qty) ||
    qty <= 0 ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !['BUY', 'SELL'].includes(normalizedSide)
  ) {
    return null;
  }

  const delta = pnlUsdt / qty;
  if (!Number.isFinite(delta) || delta <= 0) {
    return null;
  }

  if (normalizedSide === 'BUY') {
    return type === 'sl' ? price - delta : price + delta;
  }

  return type === 'sl' ? price + delta : price - delta;
}

// Binance USDT-M futures maintenance margin tiers (approximate)
// maintAmt is the bracket adjustment that makes liq price sensitive to order size
function getMaintenanceTier(notionalUsdt) {
  const n = Number(notionalUsdt);
  if (n < 50000)    return { mmr: 0.0040, maintAmt: 0 };
  if (n < 250000)   return { mmr: 0.0050, maintAmt: 50 };
  if (n < 1000000)  return { mmr: 0.0100, maintAmt: 1300 };
  if (n < 10000000) return { mmr: 0.0250, maintAmt: 16300 };
  if (n < 20000000) return { mmr: 0.0500, maintAmt: 266300 };
  return                   { mmr: 0.1000, maintAmt: 1266300 };
}

function buildCompoundMilestoneSummary({
  startingBalance,
  completedTradesCount,
  targetAmount = 100000,
  profitPercent = 2,
}) {
  const baseBalance = Number(startingBalance);
  const completedTrades = Math.max(0, Number.parseInt(completedTradesCount, 10) || 0);
  const rate = Number(profitPercent) / 100;
  const growthFactor = 1 + rate;

  if (!Number.isFinite(baseBalance) || baseBalance <= 0 || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  let milestoneStartBalance = baseBalance;
  for (let i = 0; i < completedTrades; i += 1) {
    milestoneStartBalance *= growthFactor;
  }

  const milestoneProfit = milestoneStartBalance * rate;
  const milestoneEndBalance = milestoneStartBalance + milestoneProfit;

  let projectedBalance = milestoneStartBalance;
  let tradesRemaining = 0;
  while (projectedBalance < targetAmount && tradesRemaining < 1000) {
    projectedBalance *= growthFactor;
    tradesRemaining += 1;
  }

  return {
    targetAmount,
    profitPercent,
    completedTrades,
    nextTradeNumber: completedTrades + 1,
    milestoneStartBalance,
    milestoneProfit,
    milestoneEndBalance,
    tradesRemaining,
    progressPercent: Math.min((milestoneStartBalance / targetAmount) * 100, 100),
  };
}

export default function NewOrderPage() {
  const [search, setSearch] = useState('');
  const [coinsTab, setCoinsTab] = useState('threeDay');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [side, setSide] = useState('BUY');
  const [usdtAmount, setUsdtAmount] = useState('100');
  const [leverage, setLeverage] = useState(20);
  const [stopLossUsdt, setStopLossUsdt] = useState('');
  const [isStopLossEdited, setIsStopLossEdited] = useState(false);
  const [takeProfitUsdt, setTakeProfitUsdt] = useState('');
  const [isTargetEdited, setIsTargetEdited] = useState(false);
  const [chartInterval, setChartInterval] = useState('60');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitResult, setSubmitResult] = useState(null);
  const [compoundData, setCompoundData] = useState({ startingBalance: null, completedTrades: [] });
  const [compoundLoading, setCompoundLoading] = useState(true);
  const [compoundError, setCompoundError] = useState('');

  const {
    data: symbolsData,
    loading: symbolsLoading,
    error: symbolsError,
    refetch: refetchSymbols,
  } = useFetch('/api/futures?type=symbols');

  const {
    data: shortlistData,
    loading: shortlistLoading,
    error: shortlistError,
    refetch: refetchShortlist,
  } = useFetch('/api/futures?type=shortlist3d&limit=200', { refreshInterval: REFRESH_INTERVAL_MS });

  const {
    data: rsiScanData,
    loading: rsiScanLoading,
    error: rsiScanError,
    refetch: refetchRsiScan,
  } = useFetch('/api/futures?type=rsi1hscan&scanLimit=280', { refreshInterval: REFRESH_INTERVAL_MS });

  const {
    data: accountData,
    loading: accountLoading,
    error: accountError,
    refetch: refetchAccount,
  } = useFetch('/api/futures?type=account', { refreshInterval: REFRESH_INTERVAL_MS });

  const {
    data: priceData,
    loading: priceLoading,
    error: priceError,
    refetch: refetchPrice,
  } = useFetch(`/api/prices?symbols=${symbol || 'BTCUSDT'}`, { refreshInterval: REFRESH_INTERVAL_MS });

  const fetchCompoundData = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setCompoundLoading(true);

      const response = await fetch('/api/compound');
      const data = await response.json();

      const rawStartingBalance = Number(data?.startingBalance);
      const normalizedStartingBalance = Number.isFinite(rawStartingBalance) && rawStartingBalance > 0
        ? rawStartingBalance
        : null;

      const normalizedCompletedTrades = Array.isArray(data?.completedTrades)
        ? data.completedTrades
        : [];

      setCompoundData({
        startingBalance: normalizedStartingBalance,
        completedTrades: normalizedCompletedTrades,
      });
      setCompoundError('');
    } catch (error) {
      setCompoundError(error.message || 'Failed to load compound milestones.');
    } finally {
      if (!isBackground) setCompoundLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompoundData();
    const interval = setInterval(() => fetchCompoundData(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchCompoundData]);

  const symbols = symbolsData || [];
  const shortlist = shortlistData || [];
  const rsiBelow30Rows = rsiScanData?.below30 || [];
  const rsiAbove70Rows = rsiScanData?.above70 || [];

  useEffect(() => {
    if (symbols.length === 0) return;

    const selectedExists = symbols.some(item => item.symbol === symbol);
    if (!selectedExists) {
      const defaultSymbol = symbols.find(item => item.symbol === 'BTCUSDT')?.symbol || symbols[0].symbol;
      setSymbol(defaultSymbol);
    }
  }, [symbols, symbol]);

  const filteredSymbols = useMemo(() => {
    const keyword = search.trim().toUpperCase();
    if (!keyword) return symbols;

    return symbols.filter(item => (
      item.symbol.includes(keyword) ||
      item.baseAsset.includes(keyword) ||
      item.quoteAsset.includes(keyword)
    ));
  }, [search, symbols]);

  const selectedSymbol = useMemo(
    () => symbols.find(item => item.symbol === symbol),
    [symbols, symbol],
  );

  const shortlistMap = useMemo(() => {
    const map = new Map();
    shortlist.forEach(item => map.set(item.symbol, item.change3dPercent));
    return map;
  }, [shortlist]);

  const coinsListRows = useMemo(() => {
    return filteredSymbols
      .map(item => ({
        symbol: item.symbol,
        baseAsset: item.baseAsset,
        quoteAsset: item.quoteAsset,
        change3dPercent: shortlistMap.get(item.symbol),
      }))
      .sort((a, b) => {
        const av = Number.isFinite(a.change3dPercent) ? a.change3dPercent : -Infinity;
        const bv = Number.isFinite(b.change3dPercent) ? b.change3dPercent : -Infinity;
        if (bv !== av) return bv - av;
        return a.symbol.localeCompare(b.symbol);
      });
  }, [search, filteredSymbols, shortlist, shortlistMap]);

  const activeCoinRows = useMemo(() => {
    if (coinsTab === 'threeDay') {
      return coinsListRows;
    }

    const sourceRows = coinsTab === 'rsiBelow30' ? rsiBelow30Rows : rsiAbove70Rows;
    const keyword = search.trim().toUpperCase();
    if (!keyword) return sourceRows;

    return sourceRows.filter(item => (
      item.symbol.includes(keyword) ||
      item.baseAsset.includes(keyword) ||
      item.quoteAsset.includes(keyword)
    ));
  }, [coinsTab, coinsListRows, rsiBelow30Rows, rsiAbove70Rows, search]);

  const activeTabBaseCount = useMemo(() => {
    if (coinsTab === 'threeDay') return symbols.length;
    return coinsTab === 'rsiBelow30' ? rsiBelow30Rows.length : rsiAbove70Rows.length;
  }, [coinsTab, symbols.length, rsiBelow30Rows.length, rsiAbove70Rows.length]);

  const coinsListLoading = coinsTab === 'threeDay'
    ? (symbolsLoading || shortlistLoading)
    : rsiScanLoading;

  const currentPrice = useMemo(() => {
    return Number(priceData?.[symbol]?.price || 0);
  }, [priceData, symbol]);

  const notionalValue = useMemo(() => {
    const amount = Number(usdtAmount);
    const lev = Number(leverage);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(lev) || lev <= 0) {
      return 0;
    }
    return amount * lev;
  }, [usdtAmount, leverage]);

  const estimatedQuantity = useMemo(() => {
    if (!Number.isFinite(currentPrice) || currentPrice <= 0 || notionalValue <= 0) {
      return 0;
    }
    const rawQuantity = notionalValue / currentPrice;
    return normalizeOrderQuantity(rawQuantity, selectedSymbol);
  }, [currentPrice, notionalValue, selectedSymbol]);

  const availableBalance = useMemo(
    () => Number(accountData?.availableBalance || 0),
    [accountData?.availableBalance],
  );

  const completedMilestonesCount = useMemo(
    () => (Array.isArray(compoundData?.completedTrades) ? compoundData.completedTrades.length : 0),
    [compoundData],
  );

  const compoundStartingBalance = useMemo(() => {
    const stored = Number(compoundData?.startingBalance);
    if (Number.isFinite(stored) && stored > 0) return stored;

    const walletBalance = Number(accountData?.totalWalletBalance || 0);
    return Number.isFinite(walletBalance) && walletBalance > 0 ? walletBalance : 0;
  }, [compoundData?.startingBalance, accountData?.totalWalletBalance]);

  const compoundMilestone = useMemo(
    () => buildCompoundMilestoneSummary({
      startingBalance: compoundStartingBalance,
      completedTradesCount: completedMilestonesCount,
      targetAmount: 100000,
      profitPercent: 2,
    }),
    [compoundStartingBalance, completedMilestonesCount],
  );

  const compoundMilestoneTargetUsdt = useMemo(() => {
    const value = Number(compoundMilestone?.milestoneProfit);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
  }, [compoundMilestone]);

  const milestoneTargetDisplayUsdt = useMemo(() => {
    const inputValue = Number(takeProfitUsdt);
    if (Number.isFinite(inputValue) && inputValue > 0) return inputValue;
    return compoundMilestoneTargetUsdt;
  }, [takeProfitUsdt, compoundMilestoneTargetUsdt]);

  const isCustomMilestoneTarget = useMemo(() => {
    if (!Number.isFinite(milestoneTargetDisplayUsdt) || !Number.isFinite(compoundMilestoneTargetUsdt)) {
      return false;
    }
    return Math.abs(milestoneTargetDisplayUsdt - compoundMilestoneTargetUsdt) > 0.01;
  }, [milestoneTargetDisplayUsdt, compoundMilestoneTargetUsdt]);

  const defaultStopLossUsdt = useMemo(() => {
    const walletBalance = Number(accountData?.totalWalletBalance ?? accountData?.availableBalance ?? 0);
    if (!Number.isFinite(walletBalance) || walletBalance <= 0) return null;
    return walletBalance * 0.05;
  }, [accountData?.totalWalletBalance, accountData?.availableBalance]);

  useEffect(() => {
    if (isTargetEdited) return;
    if (!Number.isFinite(compoundMilestoneTargetUsdt) || compoundMilestoneTargetUsdt <= 0) return;

    const defaultTarget = compoundMilestoneTargetUsdt.toFixed(2);
    if (takeProfitUsdt !== defaultTarget) {
      setTakeProfitUsdt(defaultTarget);
    }
  }, [compoundMilestoneTargetUsdt, isTargetEdited, takeProfitUsdt]);

  useEffect(() => {
    if (isStopLossEdited) return;
    if (!Number.isFinite(defaultStopLossUsdt) || defaultStopLossUsdt <= 0) return;

    const defaultStopLoss = defaultStopLossUsdt.toFixed(2);
    if (stopLossUsdt !== defaultStopLoss) {
      setStopLossUsdt(defaultStopLoss);
    }
  }, [defaultStopLossUsdt, isStopLossEdited, stopLossUsdt]);

  const setAmountByPercent = (percent) => {
    if (!Number.isFinite(availableBalance) || availableBalance <= 0) return;
    const nextAmount = (availableBalance * percent) / 100;
    setUsdtAmount(nextAmount.toFixed(2));
  };

  const applyCompoundMilestoneTarget = () => {
    if (!Number.isFinite(compoundMilestoneTargetUsdt) || compoundMilestoneTargetUsdt <= 0) return;
    setIsTargetEdited(false);
    setTakeProfitUsdt(compoundMilestoneTargetUsdt.toFixed(2));
  };

  const setRiskUsdtByPercent = (type, percent) => {
    if (!Number.isFinite(notionalValue) || notionalValue <= 0) return;
    const pct = Number(percent) / 100;
    if (!Number.isFinite(pct) || pct <= 0) return;

    const usdtRisk = (notionalValue * pct).toFixed(2);
    if (type === 'sl') {
      setIsStopLossEdited(true);
      setStopLossUsdt(usdtRisk);
      return;
    }
    setIsTargetEdited(true);
    setTakeProfitUsdt(usdtRisk);
  };

  const usdtSliderPct = useMemo(() => {
    if (!availableBalance || availableBalance <= 0) return 0;
    const pct = (Number(usdtAmount) / availableBalance) * 100;
    return Math.min(100, Math.max(0, Math.round(pct)));
  }, [usdtAmount, availableBalance]);

  const liquidationTier = useMemo(() => getMaintenanceTier(notionalValue), [notionalValue]);

  const liquidationPrice = useMemo(() => {
    const ep = currentPrice;
    const lev = Number(leverage);
    const usdt = Number(usdtAmount);
    const balance = availableBalance;
    const { mmr } = liquidationTier;
    if (
      !Number.isFinite(ep) || ep <= 0 ||
      !Number.isFinite(lev) || lev <= 0 ||
      !Number.isFinite(usdt) || usdt <= 0 ||
      !Number.isFinite(balance) || balance <= 0
    ) return null;
    // Cross-margin style: at what price does the full balance get wiped?
    // Long:  Liq = EP × (1 + MMR − balance / (usdt × lev))
    // Short: Liq = EP × (1 − MMR + balance / (usdt × lev))
    const balanceFactor = balance / (usdt * lev);
    if (side === 'BUY') {
      const liq = ep * (1 + mmr - balanceFactor);
      return liq > 0 && liq < ep ? liq : null;
    }
    const liq = ep * (1 - mmr + balanceFactor);
    return liq > ep ? liq : null;
  }, [currentPrice, leverage, usdtAmount, availableBalance, side, liquidationTier]);

  const stopLossTriggerPreview = useMemo(() => {
    if (stopLossUsdt.trim() === '') return null;
    return computeTriggerPriceFromUsdt({
      riskUsdt: stopLossUsdt,
      side,
      quantity: estimatedQuantity,
      markPrice: currentPrice,
      type: 'sl',
    });
  }, [stopLossUsdt, side, estimatedQuantity, currentPrice]);

  const takeProfitTriggerPreview = useMemo(() => {
    if (takeProfitUsdt.trim() === '') return null;
    return computeTriggerPriceFromUsdt({
      riskUsdt: takeProfitUsdt,
      side,
      quantity: estimatedQuantity,
      markPrice: currentPrice,
      type: 'tp',
    });
  }, [takeProfitUsdt, side, estimatedQuantity, currentPrice]);

  const formatTriggerPrice = (value) => {
    if (!Number.isFinite(value) || value <= 0) return '--';
    return Number(value).toFixed(getSafePricePrecision(selectedSymbol));
  };

  const tradingViewSrc = useMemo(() => {
    const tvSymbol = `BINANCE:${(symbol || 'BTCUSDT').toUpperCase()}.P`;
    const studies = JSON.stringify([
      'BB@tv-basicstudies',
      'StochasticRSI@tv-basicstudies',
      'MACD@tv-basicstudies',
    ]);
    const params = new URLSearchParams({
      symbol: tvSymbol,
      interval: chartInterval,
      theme: 'dark',
      style: '1',
      locale: 'en',
      toolbarbg: '#1f2937',
      withdateranges: '1',
      hide_side_toolbar: '0',
      hidevolume: '1',
      hide_volume: '1',
      allow_symbol_change: '0',
      saveimage: '0',
      studies,
    });
    return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
  }, [symbol, chartInterval]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');
    setSubmitResult(null);

    if (!symbol) {
      setSubmitError('Please select a futures symbol.');
      return;
    }

    const parsedLeverage = parseInt(leverage, 10);
    if (!Number.isFinite(parsedLeverage) || parsedLeverage < 1 || parsedLeverage > 125) {
      setSubmitError('Leverage must be between 1 and 125.');
      return;
    }

    const parsedUsdtAmount = Number(usdtAmount);
    if (!Number.isFinite(parsedUsdtAmount) || parsedUsdtAmount <= 0) {
      setSubmitError('USDT amount must be a positive number.');
      return;
    }

    const parsedStopLossUsdt =
      stopLossUsdt.trim() === ''
        ? null
        : Number(stopLossUsdt);
    const parsedTakeProfitUsdt =
      takeProfitUsdt.trim() === ''
        ? null
        : Number(takeProfitUsdt);

    if (parsedStopLossUsdt !== null && (!Number.isFinite(parsedStopLossUsdt) || parsedStopLossUsdt <= 0)) {
      setSubmitError('Stop loss USDT value must be a positive number or empty.');
      return;
    }

    if (parsedTakeProfitUsdt !== null && (!Number.isFinite(parsedTakeProfitUsdt) || parsedTakeProfitUsdt <= 0)) {
      setSubmitError('Target USDT value must be a positive number or empty.');
      return;
    }

    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      setSubmitError('Live price unavailable for selected symbol. Please retry.');
      return;
    }

    const rawQuantity = (parsedUsdtAmount * parsedLeverage) / currentPrice;
    const normalizedQuantity = normalizeOrderQuantity(rawQuantity, selectedSymbol);

    if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
      setSubmitError('Calculated quantity is too small for this symbol. Increase USDT amount.');
      return;
    }

    const minQty = Number(selectedSymbol?.minQty);
    if (Number.isFinite(minQty) && minQty > 0 && normalizedQuantity < minQty) {
      setSubmitError(`Calculated quantity ${normalizedQuantity} is below min qty ${minQty} for ${symbol}.`);
      return;
    }

    const computedStopLossPrice = parsedStopLossUsdt === null
      ? null
      : computeTriggerPriceFromUsdt({
        riskUsdt: parsedStopLossUsdt,
        side,
        quantity: normalizedQuantity,
        markPrice: currentPrice,
        type: 'sl',
      });

    const computedTakeProfitPrice = parsedTakeProfitUsdt === null
      ? null
      : computeTriggerPriceFromUsdt({
        riskUsdt: parsedTakeProfitUsdt,
        side,
        quantity: normalizedQuantity,
        markPrice: currentPrice,
        type: 'tp',
      });

    if (parsedStopLossUsdt !== null && (!Number.isFinite(computedStopLossPrice) || computedStopLossPrice <= 0)) {
      setSubmitError('Stop loss USDT value is too large for this position size.');
      return;
    }

    if (parsedTakeProfitUsdt !== null && (!Number.isFinite(computedTakeProfitPrice) || computedTakeProfitPrice <= 0)) {
      setSubmitError('Target USDT value is too large for this position size.');
      return;
    }

    const pricePrecision = getSafePricePrecision(selectedSymbol);
    const normalizedStopLossPrice = computedStopLossPrice === null
      ? null
      : Number(computedStopLossPrice.toFixed(pricePrecision));
    const normalizedTakeProfitPrice = computedTakeProfitPrice === null
      ? null
      : Number(computedTakeProfitPrice.toFixed(pricePrecision));

    try {
      setSubmitting(true);

      const response = await fetch('/api/futures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'openPosition',
          symbol,
          side,
          quantity: normalizedQuantity,
          leverage: parsedLeverage,
          stopLossPrice: normalizedStopLossPrice,
          takeProfitPrice: normalizedTakeProfitPrice,
          pricePrecision: selectedSymbol?.pricePrecision,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to place futures order');
      }

      setSubmitResult(result.data);
      refetchAccount();
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-full xl:max-w-screen-2xl mx-auto px-2 sm:px-6 lg:px-12 py-4 md:py-8 flex flex-col">
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 md:gap-6">
        <section className="xl:col-span-3 bg-gray-800/50 rounded-xl border border-gray-700 p-4 md:p-6">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg md:text-xl font-semibold text-white">Place Order</h2>
            <button
              onClick={() => {
                refetchSymbols();
                refetchAccount();
                fetchCompoundData();
                refetchPrice();
                refetchShortlist();
                refetchRsiScan();
              }}
              className="px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 transition-colors"
            >
              Refresh Data
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
            <div className="xl:col-span-3">
              <div className="flex flex-col gap-3 mb-3">
                <p className="text-sm text-gray-300">
                  Selected Symbol Chart: <span className="text-white font-semibold">{symbol || 'BTCUSDT'}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CHART_TIMEFRAMES.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setChartInterval(item.value)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                        chartInterval === item.value
                          ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                          : 'bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-[520px] rounded-lg border border-gray-700 overflow-hidden bg-gray-900">
                <iframe
                  key={`${symbol}-${chartInterval}-tv-indicators-v2`}
                  title={`${symbol} TradingView chart`}
                  src={tradingViewSrc}
                  className="w-full h-full"
                  frameBorder="0"
                  allowTransparency="true"
                  scrolling="no"
                />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="xl:col-span-1 space-y-3 rounded-xl border border-gray-700 bg-gray-900/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Order Entry</h3>
                <div className="inline-flex rounded-md border border-gray-700 overflow-hidden">
                  <button type="button" className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-300 border-r border-gray-700">Market</button>
                  <button type="button" disabled className="px-2 py-1 text-xs text-gray-500">Limit</button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Symbol</label>
                <input
                  type="text"
                  value={symbol}
                  readOnly
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white font-medium"
                />
              </div>

              <div className="flex items-center justify-between text-xm text-gray-400">
                <span>Available</span>
                <span className="text-pink-400 font-medium">{formatCurrency(availableBalance || 0)}</span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-400">Leverage</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="125"
                      value={leverage}
                      onChange={(e) => setLeverage(e.target.value)}
                      className="w-14 bg-gray-900 border border-gray-700 rounded px-2 py-0.5 text-white text-xs text-center"
                    />
                    <span className="text-gray-400 text-xs">x</span>
                  </div>
                </div>
                <input
                  type="range"
                  min="1"
                  max="125"
                  step="1"
                  value={Number(leverage) || 1}
                  onChange={(e) => setLeverage(e.target.value)}
                  className="w-full accent-blue-500 cursor-pointer"
                />
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {[10, 20, 30, 50].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLeverage(String(value))}
                      className={`py-1 rounded-md text-xs border transition-colors ${
                        String(leverage) === String(value)
                          ? 'border-blue-500 text-blue-300 bg-blue-500/20'
                          : 'border-gray-700 text-gray-300 bg-gray-900 hover:bg-gray-800'
                      }`}
                    >
                      {value}x
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Order Size (USDT)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="Enter USDT amount"
                  value={usdtAmount}
                  onChange={(e) => setUsdtAmount(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                />
                <div className="mt-2 space-y-1">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={usdtSliderPct}
                    onChange={(e) => {
                      const pct = Number(e.target.value);
                      if (availableBalance > 0) {
                        setUsdtAmount(((availableBalance * pct) / 100).toFixed(2));
                      }
                    }}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>0%</span>
                    <span className="text-blue-300 font-medium">{usdtSliderPct}% of balance</span>
                    <span>100%</span>
                  </div>
                </div>
                {notionalValue > 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    {Number(usdtAmount).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    {' x '}
                    {Number(leverage).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    {' = '}
                    <span className="text-blue-300 font-medium">
                      {notionalValue.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT
                    </span>
                  </p>
                )}
              </div>

              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Stop Loss (USDT)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 50"
                      value={stopLossUsdt}
                      onChange={(e) => {
                        setIsStopLossEdited(true);
                        setStopLossUsdt(e.target.value);
                      }}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Target (USDT)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 100"
                      value={takeProfitUsdt}
                      onChange={(e) => {
                        setIsTargetEdited(true);
                        setTakeProfitUsdt(e.target.value);
                      }}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {[1, 2].map((pct) => (
                    <button
                      key={`sl-${pct}`}
                      type="button"
                      onClick={() => setRiskUsdtByPercent('sl', pct)}
                      className="py-1 rounded-md text-xs border border-gray-700 text-yellow-300 bg-gray-900 hover:bg-gray-800"
                    >
                      SL {pct}%
                    </button>
                  ))}
                  {[1, 2].map((pct) => (
                    <button
                      key={`tp-${pct}`}
                      type="button"
                      onClick={() => setRiskUsdtByPercent('tp', pct)}
                      className="py-1 rounded-md text-xs border border-gray-700 text-green-300 bg-gray-900 hover:bg-gray-800"
                    >
                      TP {pct}%
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-gray-500 mt-1 space-y-1">
                  {(stopLossUsdt.trim() !== '' || takeProfitUsdt.trim() !== '') && (
                    <p>
                      SL trigger: <span className="text-yellow-300">{formatTriggerPrice(stopLossTriggerPreview)}</span>
                      {' | '}
                      TP trigger: <span className="text-green-300">{formatTriggerPrice(takeProfitTriggerPreview)}</span>
                    </p>
                  )}
                </div>
              </div>

              {priceError && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 text-yellow-300 text-sm">
                  {priceError}
                </div>
              )}

              {submitError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-300 text-sm">
                  {submitError}
                </div>
              )}

              {submitResult && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 text-green-300 text-sm">
                  <p>
                    Order placed. ID: {submitResult.order?.orderId} | Symbol: {submitResult.order?.symbol} | Executed: {submitResult.order?.executedQty} | Leverage: {submitResult.leverage?.leverage}x
                  </p>
                  {(submitResult.riskOrders?.stopLoss || submitResult.riskOrders?.takeProfit) && (
                    <p className="mt-1 text-xs text-green-200">
                      Exit orders armed:
                      {submitResult.riskOrders?.stopLoss ? ' SL' : ''}
                      {submitResult.riskOrders?.takeProfit ? ' TP' : ''}
                    </p>
                  )}
                  {submitResult.riskOrdersError && (
                    <p className="mt-1 text-xs text-yellow-300">Entry placed, but SL/TP setup failed: {submitResult.riskOrdersError}</p>
                  )}
                </div>
              )}

              {liquidationPrice !== null && estimatedQuantity > 0 && (() => {
                const liqPct = (Number.isFinite(currentPrice) && currentPrice > 0 && Number.isFinite(liquidationPrice) && liquidationPrice > 0)
                  ? Math.abs(((liquidationPrice - currentPrice) / currentPrice) * 100)
                  : null;
                const orderPct = (availableBalance > 0 && Number(usdtAmount) > 0)
                  ? (Number(usdtAmount) / availableBalance) * 100
                  : null;
                return (
                  <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">Est. Liq Price <span className="text-gray-600">(MMR {(liquidationTier.mmr * 100).toFixed(2)}%)</span></span>
                      <span className="text-sm font-semibold text-orange-300">
                        {formatTriggerPrice(liquidationPrice)}
                        {liqPct !== null && (
                          <span className="text-[10px] text-gray-500 ml-1">({side === 'BUY' ? '▼' : '▲'} {liqPct.toFixed(2)}%)</span>
                        )}
                      </span>
                    </div>
                    <div className="border-t border-orange-500/20" />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">Order size</span>
                      <span className="text-[12px] font-semibold text-red-400">
                        {formatCurrency(Number(usdtAmount) || 0, 2)}
                        {orderPct !== null && (
                          <span className="text-[10px] font-normal text-red-500 ml-1">({orderPct.toFixed(1)}% of balance)</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSide('BUY')}
                  className={`py-2 rounded-lg border font-semibold text-sm transition-colors ${
                    side === 'BUY'
                      ? 'bg-green-500/20 border-green-500 text-green-400'
                      : 'bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  Buy / Long
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SELL')}
                  className={`py-2 rounded-lg border font-semibold text-sm transition-colors ${
                    side === 'SELL'
                      ? 'bg-red-500/20 border-red-500 text-red-400'
                      : 'bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  Sell / Short
                </button>
              </div>

              <button
                type="submit"
                disabled={submitting || symbolsLoading}
                className={`w-full py-2.5 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed text-white ${
                  side === 'BUY'
                    ? 'bg-green-600 hover:bg-green-500'
                    : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {submitting ? 'Executing Order...' : `${side === 'BUY' ? 'Buy Execute' : 'Sell Execute'}`}
              </button>

              <div className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs text-gray-300 font-medium">Compound Trading Goal</p>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">2% per trade</span>
                </div>

                {compoundLoading ? (
                  <p className="text-xs text-gray-500">Loading compound milestones...</p>
                ) : compoundMilestone ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-gray-400">Milestone Trade</p>
                        <p className="text-white font-medium">#{compoundMilestone.nextTradeNumber}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Target (This Trade)</p>
                        <p className="text-green-300 font-medium">
                          +{Number.isFinite(milestoneTargetDisplayUsdt)
                            ? formatCurrency(milestoneTargetDisplayUsdt, 2)
                            : '--'}
                        </p>
                        {isCustomMilestoneTarget && Number.isFinite(compoundMilestoneTargetUsdt) && (
                          <p className="text-[10px] text-gray-500">Default {formatCurrency(compoundMilestoneTargetUsdt, 2)}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-gray-400">Milestone Start</p>
                        <p className="text-white font-medium">{formatCurrency(compoundMilestone.milestoneStartBalance, 2)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Next Balance</p>
                        <p className="text-blue-300 font-medium">{formatCurrency(compoundMilestone.milestoneEndBalance, 2)}</p>
                      </div>
                    </div>

                    <div className="mt-2 h-1.5 rounded bg-gray-800 overflow-hidden">
                      <div className="h-full bg-blue-400" style={{ width: `${compoundMilestone.progressPercent}%` }} />
                    </div>

                    <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
                      <span>{compoundMilestone.progressPercent.toFixed(1)}% to {formatCurrency(compoundMilestone.targetAmount, 0)}</span>
                      <span>{compoundMilestone.tradesRemaining} trades left</span>
                    </div>

                    <button
                      type="button"
                      onClick={applyCompoundMilestoneTarget}
                      className="mt-2 w-full py-1 rounded-md border border-gray-700 text-xs text-blue-300 hover:bg-gray-800"
                    >
                      Use Milestone Target (+{formatCurrency(compoundMilestone.milestoneProfit, 2)})
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-gray-500">Compound milestone unavailable. Load wallet balance first.</p>
                )}

                {compoundError && (
                  <p className="text-[11px] text-yellow-300 mt-2">{compoundError}</p>
                )}
              </div>

            </form>
          </div>
        </section>

        <section className="bg-gray-800/50 rounded-xl border border-gray-700 p-4 md:p-6">
          <h2 className="text-lg font-semibold text-white mb-3">Futures Coins List</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <button
              type="button"
              onClick={() => setCoinsTab('threeDay')}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                coinsTab === 'threeDay'
                  ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                  : 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
              }`}
            >
              3D Rank
            </button>
            <button
              type="button"
              onClick={() => setCoinsTab('rsiBelow30')}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                coinsTab === 'rsiBelow30'
                  ? 'border-yellow-500 bg-yellow-500/20 text-yellow-300'
                  : 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
              }`}
            >
              1H RSI Below 30
            </button>
            <button
              type="button"
              onClick={() => setCoinsTab('rsiAbove70')}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                coinsTab === 'rsiAbove70'
                  ? 'border-orange-500 bg-orange-500/20 text-orange-300'
                  : 'border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800'
              }`}
            >
              1H RSI Above 70
            </button>
          </div>

          <p className="text-xs text-gray-400 mb-3">
            {coinsTab === 'threeDay'
              ? '3-day percentage ranking (positive to negative)'
              : coinsTab === 'rsiBelow30'
                ? 'Strategy scan: 1-hour RSI below 30, ranked by strongest oversold signal.'
                : 'Strategy scan: 1-hour RSI above 70, ranked by strongest overbought signal.'}
          </p>

          <input
            type="text"
            placeholder={coinsTab === 'threeDay' ? 'Search symbol or coin...' : 'Search RSI scan results...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white mb-3"
          />

          <div className="text-xs text-gray-400 mb-2">
            {search.trim()
              ? `Search results: ${activeCoinRows.length} / ${activeTabBaseCount}`
              : coinsTab === 'threeDay'
                ? `All symbols: ${coinsListRows.length} (ranked by 3-day positive movers first)`
                : `RSI matches: ${activeTabBaseCount} (scan universe: ${rsiScanData?.scannedCount || 0} symbols)`}
          </div>

          {symbolsError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-red-300 text-sm mb-3">
              {symbolsError}
            </div>
          )}

          {coinsTab === 'threeDay' && shortlistError && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 text-yellow-300 text-sm mb-3">
              {shortlistError}
            </div>
          )}

          {coinsTab !== 'threeDay' && rsiScanError && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 text-yellow-300 text-sm mb-3">
              {rsiScanError}
            </div>
          )}

          <div className="max-h-[520px] overflow-y-auto rounded-lg border border-gray-700 divide-y divide-gray-700">
            {coinsListLoading && (
              <div className="p-4 text-gray-400 text-sm">
                {coinsTab === 'threeDay' ? 'Loading futures symbols...' : 'Scanning 1h RSI across top futures coins...'}
              </div>
            )}

            {!coinsListLoading && activeCoinRows.length === 0 && (
              <div className="p-4 text-gray-400 text-sm">No symbols found.</div>
            )}

            {!coinsListLoading && activeCoinRows.map((item, index) => (
              <button
                type="button"
                key={item.symbol}
                onClick={() => setSymbol(item.symbol)}
                className={`w-full text-left px-3 py-2 hover:bg-gray-700/40 transition-colors ${
                  symbol === item.symbol ? 'bg-blue-500/20' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-gray-500 w-6">#{index + 1}</span>
                    <span className="text-white font-medium truncate">{item.symbol}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {coinsTab === 'threeDay' ? (
                      <span className={`text-xs font-semibold ${
                        Number.isFinite(item.change3dPercent) && item.change3dPercent > 0
                          ? 'text-green-400'
                          : 'text-gray-500'
                      }`}>
                        {Number.isFinite(item.change3dPercent)
                          ? `${item.change3dPercent > 0 ? '+' : ''}${item.change3dPercent.toFixed(2)}%`
                          : '--'}
                      </span>
                    ) : (
                      <>
                        <span className={`text-xs font-semibold ${
                          coinsTab === 'rsiBelow30' ? 'text-yellow-300' : 'text-orange-300'
                        }`}>
                          RSI {Number.isFinite(item.rsi1h) ? item.rsi1h.toFixed(2) : '--'}
                        </span>
                        <span className={`text-xs font-semibold ${
                          Number.isFinite(item.change24hPercent) && item.change24hPercent >= 0
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}>
                          {Number.isFinite(item.change24hPercent)
                            ? `${item.change24hPercent >= 0 ? '+' : ''}${item.change24hPercent.toFixed(2)}%`
                            : '--'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-4 md:mt-6 bg-gray-800/50 rounded-xl border border-gray-700 p-4 md:p-6">
        <h2 className="text-lg font-semibold text-white mb-3">Futures Account Snapshot</h2>
        {accountError ? (
          <p className="text-red-400 text-sm">{accountError}</p>
        ) : accountLoading ? (
          <p className="text-gray-400 text-sm">Loading account...</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
              <p className="text-gray-400 text-xs">Wallet</p>
              <p className="text-white font-semibold">{formatCurrency(accountData?.totalWalletBalance || 0)}</p>
            </div>
            <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
              <p className="text-gray-400 text-xs">Available</p>
              <p className="text-white font-semibold">{formatCurrency(accountData?.availableBalance || 0)}</p>
            </div>
            <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
              <p className="text-gray-400 text-xs">Unrealized PnL</p>
              <p className={`font-semibold ${(accountData?.totalUnrealizedProfit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(accountData?.totalUnrealizedProfit || 0)}
              </p>
            </div>
            <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
              <p className="text-gray-400 text-xs">Margin Balance</p>
              <p className="text-white font-semibold">{formatNumber(accountData?.totalMarginBalance || 0)}</p>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
