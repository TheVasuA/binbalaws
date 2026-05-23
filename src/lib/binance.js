import crypto from 'crypto';
import axios from 'axios';

// Spot API URLs
const BASE_URL = 'https://api.binance.com';
const TESTNET_URL = 'https://testnet.binance.vision';

// Futures API URLs
const FUTURES_URL = 'https://fapi.binance.com';
const FUTURES_TESTNET_URL = 'https://testnet.binancefuture.com';

// API Weight tracking
let currentApiWeight = 0;
let lastWeightUpdate = Date.now();

export function getApiWeight() {
  return { weight: currentApiWeight, updatedAt: lastWeightUpdate };
}

// Get the base URL based on environment
function getBaseUrl() {
  return process.env.BINANCE_TESTNET === 'true' ? TESTNET_URL : BASE_URL;
}

// Get futures base URL
function getFuturesBaseUrl() {
  return process.env.BINANCE_TESTNET === 'true' ? FUTURES_TESTNET_URL : FUTURES_URL;
}

// Create HMAC signature for authenticated requests
function createSignature(queryString, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');
}

// Cache for server time offset to avoid rate limiting
let serverTimeOffset = null;
let lastTimeSync = 0;
const TIME_SYNC_INTERVAL = 30_000; // Re-sync every 30 seconds (was 5 min — too long for clock drift)

// Get server time from Binance to avoid timestamp issues (with caching)
async function getServerTime() {
  const TS_SAFETY_MS = 500; // Safety buffer to avoid "ahead of server" error
  const now = Date.now();
  if (serverTimeOffset === null || now - lastTimeSync > TIME_SYNC_INTERVAL) {
    try {
      const response = await axios.get(`${getBaseUrl()}/api/v3/time`);
      serverTimeOffset = response.data.serverTime - now;
      lastTimeSync = now;
      console.log('[TimeSync] Spot offset:', serverTimeOffset, 'ms');
    } catch (error) {
      // If we can't sync, use local time with cached offset
      if (serverTimeOffset === null) serverTimeOffset = 0;
      console.warn('[TimeSync] Spot sync failed, offset:', serverTimeOffset);
    }
  }
  // Apply offset with safety buffer to ensure we're never ahead of server
  return Date.now() + serverTimeOffset - TS_SAFETY_MS;
}

// Cache for futures server time offset
let futuresTimeOffset = null;
let lastFuturesTimeSync = 0;

// Get futures server time (with caching)
async function getFuturesServerTime() {
  const TS_SAFETY_MS = 500; // Safety buffer to avoid "ahead of server" error
  const now = Date.now();
  if (futuresTimeOffset === null || now - lastFuturesTimeSync > TIME_SYNC_INTERVAL) {
    try {
      const response = await axios.get(`${getFuturesBaseUrl()}/fapi/v1/time`);
      futuresTimeOffset = response.data.serverTime - now;
      lastFuturesTimeSync = now;
      console.log('[TimeSync] Futures offset:', futuresTimeOffset, 'ms');
    } catch (error) {
      // Sync failed — retry on next call by clearing cache
      futuresTimeOffset = null;
      console.warn('[TimeSync] Futures sync failed, will retry');
      // Fallback: use local time (most systems are within 1s)
      return Date.now() - TS_SAFETY_MS;
    }
  }
  // Apply offset with safety buffer
  return Date.now() + futuresTimeOffset - TS_SAFETY_MS;
}

// Make authenticated request to Binance API
async function authenticatedRequest(endpoint, params = {}) {
  const apiKey = process.env.BINANCE_API_KEY?.trim();
  const apiSecret = process.env.BINANCE_API_SECRET?.trim();
  
  if (!apiKey || !apiSecret) {
    throw new Error('API keys not configured');
  }

  const timestamp = await getServerTime();
  const queryParams = { ...params, timestamp };
  const queryString = new URLSearchParams(queryParams).toString();
  const signature = createSignature(queryString, apiSecret);
  
  const url = `${getBaseUrl()}${endpoint}?${queryString}&signature=${signature}`;
  
  try {
    const response = await axios.get(url, {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });
    // Track API weight from headers
    const weight = response.headers['x-mbx-used-weight-1m'];
    if (weight) {
      currentApiWeight = parseInt(weight);
      lastWeightUpdate = Date.now();
    }
    return response.data;
  } catch (error) {
    if (error.response) {
      // Track weight even on error
      const weight = error.response.headers?.['x-mbx-used-weight-1m'];
      if (weight) {
        currentApiWeight = parseInt(weight);
        lastWeightUpdate = Date.now();
      }
      console.error('Binance API Error:', error.response.data);
      throw new Error(`Binance API: ${error.response.data.msg || error.response.data.code || 'Unknown error'}`);
    }
    throw error;
  }
}

// Make authenticated request to Binance Futures API
async function futuresAuthenticatedRequest(endpoint, params = {}) {
  const apiKey = process.env.BINANCE_API_KEY?.trim();
  const apiSecret = process.env.BINANCE_API_SECRET?.trim();
  
  if (!apiKey || !apiSecret) {
    throw new Error('API keys not configured');
  }

  const timestamp = await getFuturesServerTime();
  const queryParams = { ...params, timestamp };
  const queryString = new URLSearchParams(queryParams).toString();
  const signature = createSignature(queryString, apiSecret);
  
  const url = `${getFuturesBaseUrl()}${endpoint}?${queryString}&signature=${signature}`;
  
  try {
    const response = await axios.get(url, {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });
    // Track API weight from headers (Futures uses different header)
    const weight = response.headers['x-mbx-used-weight-1m'] || response.headers['x-mbx-used-weight'];
    if (weight) {
      currentApiWeight = parseInt(weight);
      lastWeightUpdate = Date.now();
    }
    return response.data;
  } catch (error) {
    if (error.response) {
      // Track weight even on error
      const weight = error.response.headers?.['x-mbx-used-weight-1m'] || error.response.headers?.['x-mbx-used-weight'];
      if (weight) {
        currentApiWeight = parseInt(weight);
        lastWeightUpdate = Date.now();
      }
      console.error('Binance Futures API Error:', error.response.data);
      throw new Error(`Binance Futures API: ${error.response.data.msg || error.response.data.code || 'Unknown error'}`);
    }
    throw error;
  }
}

// Make public request to Binance Futures API
async function futuresPublicRequest(endpoint, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = `${getFuturesBaseUrl()}${endpoint}${queryString ? '?' + queryString : ''}`;
  
  const response = await axios.get(url);
  return response.data;
}

// Make signed POST request to Binance Futures API
async function futuresSignedPost(endpoint, params = {}) {
  const apiKey = process.env.BINANCE_API_KEY?.trim();
  const apiSecret = process.env.BINANCE_API_SECRET?.trim();

  if (!apiKey || !apiSecret) {
    throw new Error('API keys not configured');
  }

  const timestamp = await getFuturesServerTime();
  const queryParams = { ...params, timestamp };
  const queryString = new URLSearchParams(queryParams).toString();
  const signature = createSignature(queryString, apiSecret);
  const url = `${getFuturesBaseUrl()}${endpoint}?${queryString}&signature=${signature}`;

  try {
    const response = await axios.post(url, null, {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });

    const weight = response.headers['x-mbx-used-weight-1m'] || response.headers['x-mbx-used-weight'];
    if (weight) {
      currentApiWeight = parseInt(weight);
      lastWeightUpdate = Date.now();
    }

    return response.data;
  } catch (error) {
    if (error.response) {
      const weight = error.response.headers?.['x-mbx-used-weight-1m'] || error.response.headers?.['x-mbx-used-weight'];
      if (weight) {
        currentApiWeight = parseInt(weight);
        lastWeightUpdate = Date.now();
      }
      const msg = error.response.data?.msg || error.response.data?.code || 'Unknown error';
      throw new Error(`Binance Futures API: ${msg}`);
    }
    throw error;
  }
}

// Make public request to Binance API
async function publicRequest(endpoint, params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = `${getBaseUrl()}${endpoint}${queryString ? '?' + queryString : ''}`;
  
  const response = await axios.get(url);
  return response.data;
}

// Fetch account balance
export async function getAccountBalance() {
  try {
    const accountInfo = await authenticatedRequest('/api/v3/account');
    const nonZeroBalances = {};
    
    for (const balance of accountInfo.balances) {
      const free = parseFloat(balance.free);
      const locked = parseFloat(balance.locked);
      const total = free + locked;
      
      if (total > 0) {
        nonZeroBalances[balance.asset] = {
          free,
          used: locked,
          total,
        };
      }
    }
    
    return nonZeroBalances;
  } catch (error) {
    console.error('Error fetching balance:', error.message);
    throw error;
  }
}

// Fetch current prices for all symbols
export async function getAllPrices() {
  try {
    const prices = await publicRequest('/api/v3/ticker/price');
    const priceMap = {};
    
    for (const item of prices) {
      priceMap[item.symbol] = parseFloat(item.price);
    }
    
    return priceMap;
  } catch (error) {
    console.error('Error fetching prices:', error.message);
    throw error;
  }
}

// Fetch 24hr ticker data for specific symbols
export async function get24hrTickers(symbols) {
  try {
    const tickers = await publicRequest('/api/v3/ticker/24hr');
    const tickerMap = {};
    
    for (const ticker of tickers) {
      if (symbols.includes(ticker.symbol)) {
        tickerMap[ticker.symbol] = {
          price: parseFloat(ticker.lastPrice),
          change24h: parseFloat(ticker.priceChangePercent),
          high24h: parseFloat(ticker.highPrice),
          low24h: parseFloat(ticker.lowPrice),
          volume24h: parseFloat(ticker.quoteVolume),
        };
      }
    }
    
    return tickerMap;
  } catch (error) {
    console.error('Error fetching tickers:', error.message);
    throw error;
  }
}

// Calculate portfolio value in USD
export async function calculatePortfolioValue(balances) {
  try {
    const prices = await getAllPrices();
    const symbols = Object.keys(balances)
      .filter(currency => currency !== 'USDT' && currency !== 'USD' && currency !== 'BUSD')
      .map(currency => `${currency}USDT`);
    
    const tickers = symbols.length > 0 ? await get24hrTickers(symbols) : {};
    
    let totalValue = 0;
    const holdings = [];
    
    for (const [currency, amount] of Object.entries(balances)) {
      let valueUSD = 0;
      let price = 0;
      let change24h = 0;
      
      if (currency === 'USDT' || currency === 'USD' || currency === 'BUSD') {
        valueUSD = amount.total;
        price = 1;
      } else {
        const symbol = `${currency}USDT`;
        if (prices[symbol]) {
          price = prices[symbol];
          change24h = tickers[symbol]?.change24h || 0;
          valueUSD = amount.total * price;
        }
      }
      
      if (valueUSD > 0.01) {
        holdings.push({
          currency,
          amount: amount.total,
          free: amount.free,
          used: amount.used,
          price,
          valueUSD,
          change24h,
        });
        totalValue += valueUSD;
      }
    }
    
    // Calculate allocation percentages
    holdings.forEach(holding => {
      holding.allocation = (holding.valueUSD / totalValue) * 100;
    });
    
    // Sort by value descending
    holdings.sort((a, b) => b.valueUSD - a.valueUSD);
    
    return { totalValue, holdings };
  } catch (error) {
    console.error('Error calculating portfolio value:', error.message);
    throw error;
  }
}

// Get open orders
export async function getOpenOrders(symbol = undefined) {
  try {
    const params = symbol ? { symbol } : {};
    const orders = await authenticatedRequest('/api/v3/openOrders', params);
    
    return orders.map(order => ({
      id: order.orderId.toString(),
      symbol: order.symbol,
      side: order.side.toLowerCase(),
      type: order.type.toLowerCase(),
      price: parseFloat(order.price),
      amount: parseFloat(order.origQty),
      filled: parseFloat(order.executedQty),
      remaining: parseFloat(order.origQty) - parseFloat(order.executedQty),
      status: order.status.toLowerCase(),
      timestamp: order.time,
      datetime: new Date(order.time).toISOString(),
    }));
  } catch (error) {
    console.error('Error fetching open orders:', error.message);
    throw error;
  }
}

// Get recent trades
export async function getRecentTrades(symbol = 'BTCUSDT', limit = 50) {
  try {
    const trades = await authenticatedRequest('/api/v3/myTrades', { symbol, limit });
    
    return trades.map(trade => ({
      id: trade.id.toString(),
      symbol: trade.symbol,
      side: trade.isBuyer ? 'buy' : 'sell',
      price: parseFloat(trade.price),
      amount: parseFloat(trade.qty),
      cost: parseFloat(trade.quoteQty),
      timestamp: trade.time,
      datetime: new Date(trade.time).toISOString(),
    }));
  } catch (error) {
    console.error('Error fetching trades:', error.message);
    throw error;
  }
}

// ========== FUTURES API FUNCTIONS ==========

let futuresPositive3dShortlistCache = [];
let futuresPositive3dShortlistUpdatedAt = 0;
const FUTURES_SHORTLIST_CACHE_MS = 5 * 60 * 1000;
let futuresRsi1hScanCache = null;
let futuresRsi1hScanUpdatedAt = 0;
const FUTURES_RSI_SCAN_CACHE_MS = 5 * 60 * 1000;

function calculateRsi(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? Math.abs(delta) : 0;

    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
  }

  if (avgGain === 0 && avgLoss === 0) return 50;
  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Get 3-day futures movers ranked from positive to negative
export async function getFuturesPositive3dShortlist(limit = 40) {
  try {
    const requestedLimit = Number.isFinite(parseInt(limit, 10)) ? parseInt(limit, 10) : 40;
    const now = Date.now();

    if (
      futuresPositive3dShortlistCache.length > 0 &&
      now - futuresPositive3dShortlistUpdatedAt < FUTURES_SHORTLIST_CACHE_MS
    ) {
      return futuresPositive3dShortlistCache.slice(0, requestedLimit);
    }

    const [exchangeInfo, tickers24h] = await Promise.all([
      futuresPublicRequest('/fapi/v1/exchangeInfo'),
      futuresPublicRequest('/fapi/v1/ticker/24hr'),
    ]);

    const symbolsMap = new Map(
      exchangeInfo.symbols
        .filter(s => s.status === 'TRADING' && s.contractType === 'PERPETUAL')
        .map(s => [s.symbol, s]),
    );

    // Restrict to liquid USDT futures symbols to avoid excessive API load.
    const liquidSymbols = tickers24h
      .filter(t => symbolsMap.has(t.symbol) && t.symbol.endsWith('USDT') && parseFloat(t.quoteVolume) > 0)
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 200)
      .map(t => t.symbol);

    const results = [];
    const batchSize = 12;

    for (let i = 0; i < liquidSymbols.length; i += batchSize) {
      const batch = liquidSymbols.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async (symbol) => {
          try {
            const klines = await futuresPublicRequest('/fapi/v1/klines', {
              symbol,
              interval: '1d',
              limit: 4,
            });

            if (!Array.isArray(klines) || klines.length < 4) return null;

            const open3DaysAgo = parseFloat(klines[0][1]);
            const latestClose = parseFloat(klines[3][4]);
            if (!Number.isFinite(open3DaysAgo) || open3DaysAgo <= 0 || !Number.isFinite(latestClose)) {
              return null;
            }

            const change3dPercent = ((latestClose - open3DaysAgo) / open3DaysAgo) * 100;
            const symbolInfo = symbolsMap.get(symbol);
            if (!symbolInfo) return null;

            return {
              symbol,
              baseAsset: symbolInfo.baseAsset,
              quoteAsset: symbolInfo.quoteAsset,
              lastPrice: latestClose,
              change3dPercent: parseFloat(change3dPercent.toFixed(2)),
            };
          } catch (error) {
            return null;
          }
        }),
      );

      results.push(...batchResults.filter(Boolean));
    }

    const rankedBy3dChange = results
      .sort((a, b) => b.change3dPercent - a.change3dPercent);

    futuresPositive3dShortlistCache = rankedBy3dChange;
    futuresPositive3dShortlistUpdatedAt = now;

    return rankedBy3dChange.slice(0, requestedLimit);
  } catch (error) {
    console.error('Error fetching futures 3d shortlist:', error.message);
    throw error;
  }
}

// Scan top USDT perpetual futures symbols and return 1h RSI strategy buckets.
export async function getFuturesRsi1hScan(scanLimit = 280) {
  try {
    const parsedScanLimit = parseInt(scanLimit, 10);
    const requestedScanLimit = Number.isFinite(parsedScanLimit)
      ? Math.min(Math.max(parsedScanLimit, 20), 280)
      : 280;
    const now = Date.now();

    if (
      futuresRsi1hScanCache &&
      futuresRsi1hScanCache.scanLimit === requestedScanLimit &&
      now - futuresRsi1hScanUpdatedAt < FUTURES_RSI_SCAN_CACHE_MS
    ) {
      return futuresRsi1hScanCache;
    }

    const [exchangeInfo, tickers24h] = await Promise.all([
      futuresPublicRequest('/fapi/v1/exchangeInfo'),
      futuresPublicRequest('/fapi/v1/ticker/24hr'),
    ]);

    const symbolsMap = new Map(
      exchangeInfo.symbols
        .filter(s => s.status === 'TRADING' && s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT')
        .map(s => [s.symbol, s]),
    );

    const tickerMap = new Map(tickers24h.map(t => [t.symbol, t]));

    const scanSymbols = tickers24h
      .filter(t => symbolsMap.has(t.symbol) && parseFloat(t.quoteVolume) > 0)
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, requestedScanLimit)
      .map(t => t.symbol);

    const results = [];
    const batchSize = 10;

    for (let i = 0; i < scanSymbols.length; i += batchSize) {
      const batch = scanSymbols.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async (symbol) => {
          try {
            const klines = await futuresPublicRequest('/fapi/v1/klines', {
              symbol,
              interval: '1h',
              limit: 100,
            });

            if (!Array.isArray(klines) || klines.length < 20) return null;

            const closes = klines
              .map(k => parseFloat(k[4]))
              .filter(v => Number.isFinite(v) && v > 0);

            if (closes.length < 20) return null;

            const rsi = calculateRsi(closes, 14);
            if (!Number.isFinite(rsi)) return null;

            const symbolInfo = symbolsMap.get(symbol);
            const ticker = tickerMap.get(symbol);

            if (!symbolInfo || !ticker) return null;

            const change24hRaw = parseFloat(ticker.priceChangePercent);
            const quoteVolumeRaw = parseFloat(ticker.quoteVolume);
            const lastPriceRaw = parseFloat(ticker.lastPrice);

            return {
              symbol,
              baseAsset: symbolInfo.baseAsset,
              quoteAsset: symbolInfo.quoteAsset,
              rsi1h: Number(rsi.toFixed(2)),
              lastPrice: Number.isFinite(lastPriceRaw)
                ? lastPriceRaw
                : closes[closes.length - 1],
              change24hPercent: Number.isFinite(change24hRaw)
                ? Number(change24hRaw.toFixed(2))
                : 0,
              quoteVolume: Number.isFinite(quoteVolumeRaw)
                ? quoteVolumeRaw
                : 0,
            };
          } catch (error) {
            return null;
          }
        }),
      );

      results.push(...batchResults.filter(Boolean));
    }

    const below30 = results
      .filter(item => item.rsi1h < 30)
      .sort((a, b) => {
        if (a.rsi1h !== b.rsi1h) return a.rsi1h - b.rsi1h;
        return b.quoteVolume - a.quoteVolume;
      })
      .map((item, index) => ({ ...item, rank: index + 1 }));

    const above70 = results
      .filter(item => item.rsi1h > 70)
      .sort((a, b) => {
        if (a.rsi1h !== b.rsi1h) return b.rsi1h - a.rsi1h;
        return b.quoteVolume - a.quoteVolume;
      })
      .map((item, index) => ({ ...item, rank: index + 1 }));

    const payload = {
      interval: '1h',
      period: 14,
      scanLimit: requestedScanLimit,
      scannedCount: scanSymbols.length,
      below30,
      above70,
      updatedAt: new Date(now).toISOString(),
    };

    futuresRsi1hScanCache = payload;
    futuresRsi1hScanUpdatedAt = now;

    return payload;
  } catch (error) {
    console.error('Error fetching futures RSI 1h scan:', error.message);
    throw error;
  }
}

// Get all tradable perpetual futures symbols
export async function getFuturesSymbols() {
  try {
    const exchangeInfo = await futuresPublicRequest('/fapi/v1/exchangeInfo');

    return exchangeInfo.symbols
      .filter(s => s.status === 'TRADING' && s.contractType === 'PERPETUAL')
      .map(s => {
        const lotSizeFilter = s.filters.find(f => f.filterType === 'LOT_SIZE');
        return {
          symbol: s.symbol,
          baseAsset: s.baseAsset,
          quoteAsset: s.quoteAsset,
          pricePrecision: s.pricePrecision,
          quantityPrecision: s.quantityPrecision,
          minQty: lotSizeFilter ? parseFloat(lotSizeFilter.minQty) : null,
          stepSize: lotSizeFilter ? parseFloat(lotSizeFilter.stepSize) : null,
        };
      })
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  } catch (error) {
    console.error('Error fetching futures symbols:', error.message);
    throw error;
  }
}

// Set leverage for a specific futures symbol
export async function setFuturesLeverage(symbol, leverage = 30) {
  const leverageValue = parseInt(leverage, 10);
  if (!symbol || !Number.isFinite(leverageValue)) {
    throw new Error('Invalid symbol or leverage');
  }

  return futuresSignedPost('/fapi/v1/leverage', {
    symbol: symbol.toUpperCase(),
    leverage: leverageValue,
  });
}

// Place a futures market order
export async function placeFuturesMarketOrder({ symbol, side, quantity }) {
  const normalizedSide = String(side || '').toUpperCase();
  const normalizedQuantity = Number(quantity);

  if (!symbol || !['BUY', 'SELL'].includes(normalizedSide)) {
    throw new Error('Invalid symbol or side');
  }

  if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
    throw new Error('Quantity must be a positive number');
  }

  return futuresSignedPost('/fapi/v1/order', {
    symbol: symbol.toUpperCase(),
    side: normalizedSide,
    type: 'MARKET',
    quantity: normalizedQuantity.toString(),
    newOrderRespType: 'RESULT',
  });
}

function normalizeTriggerPrice(rawPrice, pricePrecision = null) {
  const parsedPrice = Number(rawPrice);
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    return null;
  }

  const parsedPrecision = parseInt(pricePrecision, 10);
  if (!Number.isFinite(parsedPrecision)) {
    return parsedPrice.toString();
  }

  const safePrecision = Math.min(Math.max(parsedPrecision, 0), 8);
  return parsedPrice.toFixed(safePrecision);
}

// Place optional protective futures exit orders (SL / TP) for an existing position.
export async function placeFuturesExitOrders({
  symbol,
  entrySide,
  stopLossPrice = null,
  takeProfitPrice = null,
  pricePrecision = null,
}) {
  const normalizedEntrySide = String(entrySide || '').toUpperCase();
  if (!symbol || !['BUY', 'SELL'].includes(normalizedEntrySide)) {
    throw new Error('Invalid symbol or entry side for SL/TP');
  }

  const stopLossTrigger = normalizeTriggerPrice(stopLossPrice, pricePrecision);
  const takeProfitTrigger = normalizeTriggerPrice(takeProfitPrice, pricePrecision);

  if (!stopLossTrigger && !takeProfitTrigger) {
    throw new Error('No valid SL/TP price provided');
  }

  const exitSide = normalizedEntrySide === 'BUY' ? 'SELL' : 'BUY';
  const response = {
    stopLoss: null,
    takeProfit: null,
  };

  if (stopLossTrigger) {
    response.stopLoss = await futuresSignedPost('/fapi/v1/order', {
      symbol: symbol.toUpperCase(),
      side: exitSide,
      type: 'STOP_MARKET',
      stopPrice: stopLossTrigger,
      closePosition: 'true',
      workingType: 'MARK_PRICE',
      priceProtect: 'true',
    });
  }

  if (takeProfitTrigger) {
    response.takeProfit = await futuresSignedPost('/fapi/v1/order', {
      symbol: symbol.toUpperCase(),
      side: exitSide,
      type: 'TAKE_PROFIT_MARKET',
      stopPrice: takeProfitTrigger,
      closePosition: 'true',
      workingType: 'MARK_PRICE',
      priceProtect: 'true',
    });
  }

  return response;
}

// Get futures account information
export async function getFuturesAccount() {
  try {
    const account = await futuresAuthenticatedRequest('/fapi/v2/account');
    return {
      totalWalletBalance: parseFloat(account.totalWalletBalance),
      totalUnrealizedProfit: parseFloat(account.totalUnrealizedProfit),
      totalMarginBalance: parseFloat(account.totalMarginBalance),
      availableBalance: parseFloat(account.availableBalance),
      totalMaintMargin: parseFloat(account.totalMaintMargin),
      totalPositionInitialMargin: parseFloat(account.totalPositionInitialMargin),
      assets: account.assets
        .filter(a => parseFloat(a.walletBalance) > 0)
        .map(a => ({
          asset: a.asset,
          walletBalance: parseFloat(a.walletBalance),
          unrealizedProfit: parseFloat(a.unrealizedProfit),
          marginBalance: parseFloat(a.marginBalance),
          availableBalance: parseFloat(a.availableBalance),
        })),
    };
  } catch (error) {
    console.error('Error fetching futures account:', error.message);
    throw error;
  }
}

// Get futures positions
export async function getFuturesPositions() {
  try {
    const [positions, openOrders] = await Promise.all([
      futuresAuthenticatedRequest('/fapi/v2/positionRisk'),
      futuresAuthenticatedRequest('/fapi/v1/openOrders')
    ]);
    
    // Debug: log all open order types to diagnose SL/TP detection
    console.log('[FuturesPositions] openOrders raw:', JSON.stringify(openOrders.map(o => ({
      symbol: o.symbol, type: o.type, side: o.side, stopPrice: o.stopPrice, price: o.price, positionSide: o.positionSide
    }))));

    // Group stop loss and take profit orders by symbol
    const stopLossOrders = {};
    const takeProfitOrders = {};
    openOrders.forEach(order => {
      // Stop Loss
      if (order.type === 'STOP_MARKET' || order.type === 'STOP') {
        if (!stopLossOrders[order.symbol]) stopLossOrders[order.symbol] = [];
        stopLossOrders[order.symbol].push(order);
      }
      // Take Profit
      if (order.type === 'TAKE_PROFIT_MARKET' || order.type === 'TAKE_PROFIT') {
        if (!takeProfitOrders[order.symbol]) takeProfitOrders[order.symbol] = [];
        takeProfitOrders[order.symbol].push(order);
      }
    });

    return positions
      .filter(p => parseFloat(p.positionAmt) !== 0)
      .map(p => {
        const positionAmt = parseFloat(p.positionAmt);
        const entryPrice = parseFloat(p.entryPrice);
        const side = positionAmt > 0 ? 'LONG' : 'SHORT';
        const absAmt = Math.abs(positionAmt);

        // Find stop loss for this position
        const symbolStopOrders = stopLossOrders[p.symbol] || [];
        const stopLoss = symbolStopOrders.find(order => {
          // For LONG, stop loss is SELL; for SHORT, stop loss is BUY
          if (side === 'LONG' && order.side === 'SELL') return true;
          if (side === 'SHORT' && order.side === 'BUY') return true;
          return false;
        });

        const stopPrice = stopLoss ? parseFloat(stopLoss.stopPrice) : null;
        let stopLossValue = null;
        if (stopPrice) {
          // Calculate loss if stop loss triggers
          if (side === 'LONG') {
            stopLossValue = (stopPrice - entryPrice) * absAmt;
          } else {
            stopLossValue = (entryPrice - stopPrice) * absAmt;
          }
        }

        // Find take profit for this position
        const symbolTpOrders = takeProfitOrders[p.symbol] || [];
        const takeProfit = symbolTpOrders.find(order => {
          // For LONG, TP is SELL; for SHORT, TP is BUY
          if (side === 'LONG' && order.side === 'SELL') return true;
          if (side === 'SHORT' && order.side === 'BUY') return true;
          return false;
        });

        const tpPrice = takeProfit ? parseFloat(takeProfit.stopPrice || takeProfit.price) : null;
        let takeProfitValue = null;
        if (tpPrice) {
          // Calculate profit if take profit triggers
          if (side === 'LONG') {
            takeProfitValue = (tpPrice - entryPrice) * absAmt;
          } else {
            takeProfitValue = (entryPrice - tpPrice) * absAmt;
          }
        }

        return {
          symbol: p.symbol,
          side,
          positionAmt: absAmt,
          entryPrice,
          markPrice: parseFloat(p.markPrice),
          unrealizedProfit: parseFloat(p.unRealizedProfit),
          liquidationPrice: parseFloat(p.liquidationPrice),
          leverage: parseInt(p.leverage),
          marginType: p.marginType,
          isolatedMargin: parseFloat(p.isolatedMargin),
          notionalValue: Math.abs(parseFloat(p.notional)),
          roe: parseFloat(p.unRealizedProfit) / (parseFloat(p.isolatedMargin) || parseFloat(p.notional) / parseInt(p.leverage)) * 100,
          stopLossPrice: stopPrice,
          stopLossValue,
          takeProfitPrice: tpPrice,
          takeProfitValue,
        };
      });
  } catch (error) {
    console.error('Error fetching futures positions:', error.message);
    throw error;
  }
}

// Get futures open orders
export async function getFuturesOpenOrders(symbol = undefined) {
  try {
    const params = symbol ? { symbol } : {};
    const orders = await futuresAuthenticatedRequest('/fapi/v1/openOrders', params);
    
    return orders.map(order => ({
      id: order.orderId.toString(),
      symbol: order.symbol,
      side: order.side.toLowerCase(),
      positionSide: order.positionSide,
      type: order.type.toLowerCase(),
      price: parseFloat(order.price),
      stopPrice: parseFloat(order.stopPrice),
      amount: parseFloat(order.origQty),
      filled: parseFloat(order.executedQty),
      remaining: parseFloat(order.origQty) - parseFloat(order.executedQty),
      status: order.status.toLowerCase(),
      reduceOnly: order.reduceOnly,
      timestamp: order.time,
      datetime: new Date(order.time).toISOString(),
    }));
  } catch (error) {
    console.error('Error fetching futures open orders:', error.message);
    throw error;
  }
}

// Get futures mark prices
export async function getFuturesMarkPrices() {
  try {
    const prices = await futuresPublicRequest('/fapi/v1/premiumIndex');
    const priceMap = {};
    
    for (const item of prices) {
      priceMap[item.symbol] = {
        markPrice: parseFloat(item.markPrice),
        indexPrice: parseFloat(item.indexPrice),
        fundingRate: parseFloat(item.lastFundingRate),
        nextFundingTime: item.nextFundingTime,
      };
    }
    
    return priceMap;
  } catch (error) {
    console.error('Error fetching futures mark prices:', error.message);
    throw error;
  }
}

// Get futures income history (PnL history)
export async function getFuturesIncome(incomeType = undefined, limit = 100) {
  try {
    const params = { limit };
    if (incomeType) params.incomeType = incomeType;
    
    const income = await futuresAuthenticatedRequest('/fapi/v1/income', params);
    
    return income.map(i => ({
      symbol: i.symbol,
      incomeType: i.incomeType,
      income: parseFloat(i.income),
      asset: i.asset,
      timestamp: i.time,
      datetime: new Date(i.time).toISOString(),
    }));
  } catch (error) {
    console.error('Error fetching futures income:', error.message);
    throw error;
  }
}

// Calculate futures risk metrics
export function calculateFuturesRiskMetrics(positions, account) {
  if (!positions || positions.length === 0) {
    return {
      totalPnL: 0,
      totalPnLPercent: 0,
      maxLeverage: 0,
      avgLeverage: 0,
      marginUsage: 0,
      positionCount: 0,
      longExposure: 0,
      shortExposure: 0,
      riskLevel: 'N/A',
    };
  }

  const totalPnL = positions.reduce((sum, p) => sum + p.unrealizedProfit, 0);
  const totalNotional = positions.reduce((sum, p) => sum + p.notionalValue, 0);
  const longExposure = positions.filter(p => p.side === 'LONG').reduce((sum, p) => sum + p.notionalValue, 0);
  const shortExposure = positions.filter(p => p.side === 'SHORT').reduce((sum, p) => sum + p.notionalValue, 0);
  const maxLeverage = Math.max(...positions.map(p => p.leverage));
  const avgLeverage = positions.reduce((sum, p) => sum + p.leverage, 0) / positions.length;
  
  const marginUsage = account ? (account.totalPositionInitialMargin / account.totalMarginBalance) * 100 : 0;
  const totalPnLPercent = account ? (totalPnL / account.totalWalletBalance) * 100 : 0;

  let riskLevel;
  if (maxLeverage >= 20 || marginUsage > 80) riskLevel = 'Very High';
  else if (maxLeverage >= 10 || marginUsage > 50) riskLevel = 'High';
  else if (maxLeverage >= 5 || marginUsage > 30) riskLevel = 'Medium';
  else riskLevel = 'Low';

  return {
    totalPnL: totalPnL.toFixed(2),
    totalPnLPercent: totalPnLPercent.toFixed(2),
    maxLeverage,
    avgLeverage: avgLeverage.toFixed(1),
    marginUsage: marginUsage.toFixed(1),
    positionCount: positions.length,
    longExposure: longExposure.toFixed(2),
    shortExposure: shortExposure.toFixed(2),
    totalNotional: totalNotional.toFixed(2),
    riskLevel,
  };
}

// Close a futures position with market order
export async function closePosition(symbol, side, quantity) {
  const apiKey = process.env.BINANCE_API_KEY?.trim();
  const apiSecret = process.env.BINANCE_API_SECRET?.trim();
  
  if (!apiKey || !apiSecret) {
    throw new Error('API keys not configured');
  }

  const timestamp = await getFuturesServerTime();
  
  // To close a position, we need to open opposite side
  // LONG position -> SELL to close
  // SHORT position -> BUY to close
  const closeSide = side === 'LONG' ? 'SELL' : 'BUY';
  
  const params = {
    symbol,
    side: closeSide,
    type: 'MARKET',
    quantity: quantity.toString(),
    reduceOnly: 'true',
    timestamp,
  };
  
  const queryString = new URLSearchParams(params).toString();
  const signature = createSignature(queryString, apiSecret);
  
  const url = `${getFuturesBaseUrl()}/fapi/v1/order?${queryString}&signature=${signature}`;
  
  try {
    const response = await axios.post(url, null, {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('Close position error:', error.response.data);
      const msg = error.response.data.msg || 'Failed to close position';
      if (msg.includes('API-key') || msg.includes('permissions')) {
        throw new Error('API key missing Futures Trading permission. Enable it in Binance API settings.');
      }
      throw new Error(`Binance API: ${msg}`);
    }
    throw error;
  }
}

// Get futures trade history (realized PnL)
export async function getFuturesTradeHistory(limit = 10) {
  try {
    // Get recent income history which includes realized PnL
    const income = await futuresAuthenticatedRequest('/fapi/v1/income', { 
      incomeType: 'REALIZED_PNL',
      limit: limit 
    });
    
    return income.map(item => ({
      id: item.tranId?.toString() || `${item.time}`,
      symbol: item.symbol,
      incomeType: item.incomeType,
      income: parseFloat(item.income),
      asset: item.asset,
      timestamp: item.time,
      datetime: new Date(item.time).toISOString(),
    })).sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Error fetching futures trade history:', error.message);
    throw error;
  }
}

// Get closed/filled futures orders
export async function getFuturesClosedOrders(symbol = null, limit = 10) {
  try {
    const params = { limit: 100 }; // Fetch more to filter
    if (symbol) params.symbol = symbol;
    
    const orders = await futuresAuthenticatedRequest('/fapi/v1/allOrders', params);
    
    // Filter only filled/closed orders and limit results
    const closedOrders = orders
      .filter(order => order.status === 'FILLED' || order.status === 'CANCELED')
      .sort((a, b) => b.updateTime - a.updateTime)
      .slice(0, limit)
      .map(order => ({
        id: order.orderId.toString(),
        symbol: order.symbol,
        side: order.side.toLowerCase(),
        positionSide: order.positionSide,
        type: order.type.toLowerCase().replace('_', ' '),
        status: order.status.toLowerCase(),
        price: parseFloat(order.avgPrice) || parseFloat(order.price),
        quantity: parseFloat(order.origQty),
        executedQty: parseFloat(order.executedQty),
        reduceOnly: order.reduceOnly,
        closePosition: order.closePosition,
        timestamp: order.updateTime,
        datetime: new Date(order.updateTime).toISOString(),
      }));
    
    return closedOrders;
  } catch (error) {
    console.error('Error fetching closed orders:', error.message);
    throw error;
  }
}
