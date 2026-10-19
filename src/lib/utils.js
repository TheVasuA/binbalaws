
'use client';
// Format currency with full precision (up to 8 decimals, no rounding)
export function formatCurrencyFull(value) {
  if (value === undefined || value === null) return '$0.0000';
  const absVal = Math.abs(Number(value));
  let decimals = 4;
  if (absVal > 0 && absVal < 0.0001) decimals = 6;
  return '$' + Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).replace(/\.0+$/, '');
}

import { useState, useEffect, useCallback } from 'react';

export function useFetch(url, options = {}) {
  const { refreshInterval = 0 } = options;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apiWeight, setApiWeight] = useState(null);

  const fetchData = useCallback(async (isBackground = false, fresh = false) => {
    try {
      if (!isBackground) setLoading(true);
      setError(null);

      const fetchUrl = fresh
        ? `${url}${url.includes('?') ? '&' : '?'}fresh=1`
        : url;
      const response = await fetch(fetchUrl);
      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
        if (result.apiWeight !== undefined) {
          setApiWeight(result.apiWeight);
        }
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchData();
    
    // Set up auto-refresh if interval is specified
    if (refreshInterval > 0) {
      const interval = setInterval(() => fetchData(true), refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, refreshInterval]);

  const refetch = (fresh = false) => fetchData(false, fresh);

  return { data, loading, error, refetch, apiWeight };
}

export function formatCurrency(value, decimals = 2) {
  if (value === undefined || value === null) return '$0.00';
  const num = Number(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatNumber(value, decimals = 2) {
  if (value === undefined || value === null) return '0.0000';
  const absVal = Math.abs(Number(value));
  let d = 4;
  if (absVal > 0 && absVal < 0.0001) d = 6;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(value);
}

export function formatPercent(value, decimals = 2) {
  if (value === undefined || value === null) return '0.0000%';
  const sign = value >= 0 ? '+' : '';
  const absVal = Math.abs(Number(value));
  let d = 4;
  if (absVal > 0 && absVal < 0.0001) d = 6;
  return sign + formatNumber(value, d) + '%';
}

export function getChangeColor(value) {
  if (value > 0) return 'text-green-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-500';
}

export function getRiskColor(riskLevel) {
  switch (riskLevel) {
    case 'Conservative': return 'text-green-400 bg-green-400/10';
    case 'Moderate': return 'text-yellow-400 bg-yellow-400/10';
    case 'Aggressive': return 'text-red-400 bg-red-400/10';
    default: return 'text-gray-500 bg-gray-500/10';
  }
}
