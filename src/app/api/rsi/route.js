import { NextResponse } from 'next/server';
import axios from 'axios';

// In-process cache: { key -> { rsi, expiresAt } }
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return parseFloat((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  const interval = searchParams.get('interval') || '1h';

  const cacheKey = `${symbol}:${interval}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json({ rsi: cached.rsi, cached: true });
  }

  try {
    const isTestnet = process.env.BINANCE_TESTNET === 'true';
    const base = isTestnet
      ? 'https://testnet.binancefuture.com'
      : 'https://fapi.binance.com';

    const { data } = await axios.get(`${base}/fapi/v1/klines`, {
      params: { symbol, interval, limit: 16 },
    });

    const closes = data.map(c => parseFloat(c[4]));
    const rsi = calcRSI(closes);

    cache.set(cacheKey, { rsi, expiresAt: Date.now() + CACHE_TTL_MS });

    return NextResponse.json({ rsi, cached: false });
  } catch (error) {
    console.error('[RSI API]', error.message);
    // Return cached stale value if available rather than erroring
    if (cached) return NextResponse.json({ rsi: cached.rsi, cached: true, stale: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
