"""Async Binance Futures API client with rate limiting and caching."""
import hashlib
import hmac
import time
import asyncio
import json
from typing import Optional, Any
from urllib.parse import urlencode

import httpx
from .config import (
    BINANCE_API_KEY,
    BINANCE_API_SECRET,
    BINANCE_TESTNET,
)
from .rate_limiter import auth_limiter, public_limiter, get_endpoint_weight

FUTURES_URL = 'https://testnet.binancefuture.com' if BINANCE_TESTNET else 'https://fapi.binance.com'
RECV_WINDOW = 5000


# ── Helpers ──────────────────────────────────────────────────────────────────
def _sign(query_string: str) -> str:
    return hmac.new(
        BINANCE_API_SECRET.encode('utf-8'),
        query_string.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()


def _to_timestamp() -> int:
    return int(time.time() * 1000)


# ── Shared HTTPX client (keeps connections alive) ────────────────────────────
_client: Optional[httpx.AsyncClient] = None
_client_ready = False


async def get_client() -> httpx.AsyncClient:
    global _client, _client_ready
    if _client is None or not _client_ready:
        _client = httpx.AsyncClient(
            base_url=FUTURES_URL,
            timeout=httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            headers={'X-MBX-APIKEY': BINANCE_API_KEY} if BINANCE_API_KEY else {},
        )
        _client_ready = True
    return _client


async def close_client():
    global _client, _client_ready
    if _client:
        await _client.aclose()
        _client = None
        _client_ready = False


# ── Public Requests ──────────────────────────────────────────────────────────
async def public_get(endpoint: str, params: Optional[dict] = None):
    """Make a rate-limited public GET request to Binance Futures."""
    weight = get_endpoint_weight(endpoint, params)
    await public_limiter.wait_and_acquire(weight)

    client = await get_client()
    resp = await client.get(endpoint, params=params)
    resp.raise_for_status()
    return resp.json()


# ── Authenticated Requests ───────────────────────────────────────────────────
async def signed_get(endpoint: str, params: Optional[dict] = None):
    """Make a rate-limited signed GET request to Binance Futures."""
    weight = get_endpoint_weight(endpoint, params)
    await auth_limiter.wait_and_acquire(weight)

    full_params = {
        **(params or {}),
        'timestamp': _to_timestamp(),
        'recvWindow': RECV_WINDOW,
    }
    query = urlencode(full_params)
    signature = _sign(query)
    url = f'{endpoint}?{query}&signature={signature}'

    client = await get_client()
    resp = await client.get(url)
    resp.raise_for_status()
    return resp.json()


async def signed_post(endpoint: str, params: Optional[dict] = None):
    """Make a rate-limited signed POST request to Binance Futures."""
    weight = get_endpoint_weight(endpoint, params)
    await auth_limiter.wait_and_acquire(weight)

    full_params = {
        **(params or {}),
        'timestamp': _to_timestamp(),
        'recvWindow': RECV_WINDOW,
    }
    query = urlencode(full_params)
    signature = _sign(query)
    url = f'{endpoint}?{query}&signature={signature}'

    client = await get_client()
    resp = await client.post(url)
    resp.raise_for_status()
    return resp.json()


# ── Futures API Functions ────────────────────────────────────────────────────
async def get_futures_account():
    """Fetch futures account balance/wallet info."""
    data = await signed_get('/fapi/v2/account')
    return _normalize_account(data)


async def get_positions():
    """Fetch open futures positions with SL/TP info."""
    positions_data, orders_data = await asyncio.gather(
        signed_get('/fapi/v2/positionRisk'),
        signed_get('/fapi/v1/openOrders'),
    )

    # Build SL/TP lookup map
    sl_map: dict[str, list] = {}
    tp_map: dict[str, list] = {}
    for o in orders_data:
        otype = o.get('type', '')
        sym = o.get('symbol', '')
        if otype in ('STOP_MARKET', 'STOP'):
            sl_data = sl_map.setdefault(sym, [])
            sl_data.append(o)
        elif otype in ('TAKE_PROFIT_MARKET', 'TAKE_PROFIT'):
            tp_data = tp_map.setdefault(sym, [])
            tp_data.append(o)

    positions = []
    for p in positions_data:
        amt = float(p.get('positionAmt', 0))
        if amt == 0:
            continue
        side = 'LONG' if amt > 0 else 'SHORT'
        abs_amt = abs(amt)
        entry = float(p.get('entryPrice', 0))
        sym = p.get('symbol', '')
        mark = float(p.get('markPrice', 0))
        upnl = float(p.get('unRealizedProfit', 0))
        lev = int(p.get('leverage', 1))
        liq = float(p.get('liquidationPrice', 0))
        margin_type = p.get('marginType', 'isolated')
        iso_margin = float(p.get('isolatedMargin', 0))
        notional = abs(float(p.get('notional', 0)))

        # Match SL order
        sl_price = None
        sl_value = None
        for sl_order in sl_map.get(sym, []):
            order_side = sl_order.get('side', '')
            if (side == 'LONG' and order_side == 'SELL') or (
                side == 'SHORT' and order_side == 'BUY'
            ):
                sl_price = float(sl_order.get('stopPrice', 0))
                if side == 'LONG':
                    sl_value = (sl_price - entry) * abs_amt
                else:
                    sl_value = (entry - sl_price) * abs_amt
                break

        # Match TP order
        tp_price = None
        tp_value = None
        for tp_order in tp_map.get(sym, []):
            order_side = tp_order.get('side', '')
            if (side == 'LONG' and order_side == 'SELL') or (
                side == 'SHORT' and order_side == 'BUY'
            ):
                tp_price = float(tp_order.get('stopPrice') or tp_order.get('price', 0))
                if side == 'LONG':
                    tp_value = (tp_price - entry) * abs_amt
                else:
                    tp_value = (entry - tp_price) * abs_amt
                break

        positions.append({
            'symbol': sym,
            'side': side,
            'positionAmt': abs_amt,
            'entryPrice': entry,
            'markPrice': mark,
            'unrealizedProfit': upnl,
            'liquidationPrice': liq,
            'leverage': lev,
            'marginType': margin_type,
            'isolatedMargin': iso_margin,
            'notionalValue': notional,
            'stopLossPrice': sl_price,
            'stopLossValue': sl_value,
            'takeProfitPrice': tp_price,
            'takeProfitValue': tp_value,
            'roe': (upnl / (iso_margin or (notional / lev)) * 100) if (
                iso_margin or notional) else 0,
        })

    return positions


async def get_open_orders(symbol: Optional[str] = None):
    """Fetch open orders."""
    params = {'symbol': symbol} if symbol else {}
    data = await signed_get('/fapi/v1/openOrders', params if params else None)
    return [
        {
            'id': str(o.get('orderId', '')),
            'symbol': o.get('symbol', ''),
            'side': o.get('side', '').lower(),
            'positionSide': o.get('positionSide', ''),
            'type': o.get('type', '').lower(),
            'price': float(o.get('price', 0)),
            'stopPrice': float(o.get('stopPrice', 0)),
            'amount': float(o.get('origQty', 0)),
            'filled': float(o.get('executedQty', 0)),
            'remaining': float(o.get('origQty', 0)) - float(o.get('executedQty', 0)),
            'status': o.get('status', '').lower(),
            'reduceOnly': o.get('reduceOnly', False),
            'timestamp': o.get('time', 0),
            'datetime': _ts_to_iso(o.get('time', 0)),
        }
        for o in data
    ]


async def get_mark_prices():
    """Fetch all mark prices."""
    data = await public_get('/fapi/v1/premiumIndex')
    return {
        item['symbol']: {
            'markPrice': float(item['markPrice']),
            'indexPrice': float(item['indexPrice']),
            'fundingRate': float(item['lastFundingRate']),
            'nextFundingTime': item.get('nextFundingTime', 0),
        }
        for item in data
    }


async def get_futures_symbols():
    """Get all tradable perpetual futures symbols."""
    data = await public_get('/fapi/v1/exchangeInfo')
    symbols = []
    for s in data.get('symbols', []):
        if s.get('status') != 'TRADING' or s.get('contractType') != 'PERPETUAL':
            continue
        lot = next((f for f in s.get('filters', []) if f.get('filterType') == 'LOT_SIZE'), None)
        symbols.append({
            'symbol': s['symbol'],
            'baseAsset': s['baseAsset'],
            'quoteAsset': s['quoteAsset'],
            'pricePrecision': s.get('pricePrecision', 2),
            'quantityPrecision': s.get('quantityPrecision', 2),
            'minQty': float(lot['minQty']) if lot else None,
            'stepSize': float(lot['stepSize']) if lot else None,
        })
    return sorted(symbols, key=lambda x: x['symbol'])


async def place_market_order(symbol: str, side: str, quantity: float):
    """Place a futures market order."""
    result = await signed_post('/fapi/v1/order', {
        'symbol': symbol.upper(),
        'side': side.upper(),
        'type': 'MARKET',
        'quantity': str(quantity),
        'newOrderRespType': 'RESULT',
    })
    return result


async def set_leverage(symbol: str, leverage: int):
    """Set leverage for a symbol."""
    return await signed_post('/fapi/v1/leverage', {
        'symbol': symbol.upper(),
        'leverage': leverage,
    })


async def place_exit_orders(
    symbol: str,
    entry_side: str,
    stop_loss_price: Optional[float] = None,
    take_profit_price: Optional[float] = None,
):
    """Place SL/TP orders for a position."""
    exit_side = 'SELL' if entry_side.upper() == 'BUY' else 'BUY'
    results = {'stopLoss': None, 'takeProfit': None}

    if stop_loss_price and stop_loss_price > 0:
        results['stopLoss'] = await signed_post('/fapi/v1/order', {
            'symbol': symbol.upper(),
            'side': exit_side,
            'type': 'STOP_MARKET',
            'stopPrice': str(stop_loss_price),
            'closePosition': 'true',
            'workingType': 'MARK_PRICE',
            'priceProtect': 'true',
        })

    if take_profit_price and take_profit_price > 0:
        results['takeProfit'] = await signed_post('/fapi/v1/order', {
            'symbol': symbol.upper(),
            'side': exit_side,
            'type': 'TAKE_PROFIT_MARKET',
            'stopPrice': str(take_profit_price),
            'closePosition': 'true',
            'workingType': 'MARK_PRICE',
            'priceProtect': 'true',
        })

    return results


async def close_position(symbol: str, side: str, quantity: float):
    """Close a position with a reduce-only market order."""
    close_side = 'SELL' if side.upper() == 'LONG' else 'BUY'
    return await signed_post('/fapi/v1/order', {
        'symbol': symbol.upper(),
        'side': close_side,
        'type': 'MARKET',
        'quantity': str(quantity),
        'reduceOnly': 'true',
    })


async def get_klines(symbol: str, interval: str, limit: int = 100):
    """Fetch kline/candlestick data."""
    return await public_get('/fapi/v1/klines', {
        'symbol': symbol.upper(),
        'interval': interval,
        'limit': limit,
    })


async def get_24hr_tickers():
    """Fetch 24hr ticker data for all symbols."""
    return await public_get('/fapi/v1/ticker/24hr')


# ── Symbol Scanning Logic ────────────────────────────────────────────────────
def _calculate_rsi(closes: list[float], period: int = 14) -> Optional[float]:
    """Compute RSI for a series of closing prices."""
    if len(closes) <= period:
        return None

    gains = 0.0
    losses = 0.0
    for i in range(1, period + 1):
        delta = closes[i] - closes[i - 1]
        if delta >= 0:
            gains += delta
        else:
            losses += abs(delta)

    avg_gain = gains / period
    avg_loss = losses / period

    for i in range(period + 1, len(closes)):
        delta = closes[i] - closes[i - 1]
        gain = delta if delta > 0 else 0
        loss = abs(delta) if delta < 0 else 0
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period

    if avg_gain == 0 and avg_loss == 0:
        return 50.0
    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


async def scan_rsi_1h(scan_limit: int = 280):
    """Scan top USDT perpetual futures by 1h RSI.

    Returns symbols with RSI < 30 (oversold) and > 70 (overbought).
    """
    exchange_info, tickers = await asyncio.gather(
        public_get('/fapi/v1/exchangeInfo'),
        public_get('/fapi/v1/ticker/24hr'),
    )

    symbols_set = {
        s['symbol']
        for s in exchange_info.get('symbols', [])
        if s.get('status') == 'TRADING'
        and s.get('contractType') == 'PERPETUAL'
        and s.get('quoteAsset') == 'USDT'
    }

    ticker_map = {t['symbol']: t for t in tickers if t['symbol'] in symbols_set}

    # Top by volume
    scan_symbols = sorted(
        [t for t in tickers if t['symbol'] in symbols_set and float(t.get('quoteVolume', 0)) > 0],
        key=lambda t: float(t.get('quoteVolume', 0)),
        reverse=True,
    )[:scan_limit]

    results = []
    sem = asyncio.Semaphore(10)  # batch concurrency

    async def _scan(ticker):
        async with sem:
            try:
                klines = await get_klines(ticker['symbol'], '1h', 100)
                closes = [float(k[4]) for k in klines if k and len(k) > 4]
                rsi = _calculate_rsi(closes)
                if rsi is None:
                    return None
                sym_info = next(
                    (s for s in exchange_info['symbols'] if s['symbol'] == ticker['symbol']),
                    None,
                )
                return {
                    'symbol': ticker['symbol'],
                    'baseAsset': sym_info.get('baseAsset', '') if sym_info else '',
                    'quoteAsset': sym_info.get('quoteAsset', 'USDT') if sym_info else 'USDT',
                    'rsi1h': round(rsi, 2),
                    'lastPrice': float(ticker.get('lastPrice', 0)),
                    'change24hPercent': round(float(ticker.get('priceChangePercent', 0)), 2),
                    'quoteVolume': float(ticker.get('quoteVolume', 0)),
                }
            except Exception:
                return None

    tasks = [_scan(t) for t in scan_symbols]
    raw = await asyncio.gather(*tasks)
    results = [r for r in raw if r is not None]

    below30 = sorted(
        [r for r in results if r['rsi1h'] < 30],
        key=lambda r: (r['rsi1h'], -r['quoteVolume']),
    )
    above70 = sorted(
        [r for r in results if r['rsi1h'] > 70],
        key=lambda r: (-r['rsi1h'], -r['quoteVolume']),
    )

    return {
        'interval': '1h',
        'period': 14,
        'scanLimit': scan_limit,
        'scannedCount': len(results),
        'below30': [{**r, 'rank': i + 1} for i, r in enumerate(below30)],
        'above70': [{**r, 'rank': i + 1} for i, r in enumerate(above70)],
        'updatedAt': _ts_to_iso(int(time.time() * 1000)),
    }


async def scan_3d_movers(limit: int = 40):
    """Scan top 3-day price movers (by % change, positive to negative)."""
    exchange_info, tickers = await asyncio.gather(
        public_get('/fapi/v1/exchangeInfo'),
        public_get('/fapi/v1/ticker/24hr'),
    )

    symbols_map = {
        s['symbol']: s
        for s in exchange_info.get('symbols', [])
        if s.get('status') == 'TRADING' and s.get('contractType') == 'PERPETUAL'
    }

    liquid_symbols = sorted(
        [
            t['symbol'] for t in tickers
            if t['symbol'] in symbols_map
            and t['symbol'].endswith('USDT')
            and float(t.get('quoteVolume', 0)) > 0
        ],
        key=lambda s: float(
            next((t.get('quoteVolume', 0) for t in tickers if t['symbol'] == s), 0)
        ),
        reverse=True,
    )[:200]

    results = []
    sem = asyncio.Semaphore(12)

    async def _scan(sym):
        async with sem:
            try:
                klines = await get_klines(sym, '1d', 4)
                if len(klines) < 4:
                    return None
                open3d = float(klines[0][1])
                close_now = float(klines[3][4])
                if open3d <= 0:
                    return None
                change3d = ((close_now - open3d) / open3d) * 100
                info = symbols_map.get(sym)
                return {
                    'symbol': sym,
                    'baseAsset': info.get('baseAsset', '') if info else '',
                    'quoteAsset': info.get('quoteAsset', '') if info else '',
                    'lastPrice': close_now,
                    'change3dPercent': round(change3d, 2),
                }
            except Exception:
                return None

    tasks = [_scan(s) for s in liquid_symbols]
    raw = await asyncio.gather(*tasks)
    ranked = sorted(
        (r for r in raw if r is not None),
        key=lambda r: r['change3dPercent'],
        reverse=True,
    )

    return ranked[:limit]


# ── New Order Picking Logic ──────────────────────────────────────────────────
async def scan_high_confidence_entries(min_rsi: float = 25.0, max_rsi: float = 75.0):
    """Combine RSI scan + 3d movers to find high-confidence trade entries.

    Entry conditions:
      - Oversold (RSI < 30) with positive 3d momentum → potential LONG
      - Overbought (RSI > 70) with negative 3d momentum → potential SHORT
    """
    rsi_data = await scan_rsi_1h()
    movers_data = await scan_3d_movers(80)

    mover_map = {m['symbol']: m for m in movers_data}

    long_candidates = []
    short_candidates = []

    for item in rsi_data.get('below30', []):
        mover = mover_map.get(item['symbol'])
        if mover and mover['change3dPercent'] > 2:
            long_candidates.append({
                **item,
                'change3dPercent': mover['change3dPercent'],
                'signal': 'LONG',
                'confidence': min(100, int((30 - item['rsi1h']) * 3 + abs(mover['change3dPercent']))),
            })

    for item in rsi_data.get('above70', []):
        mover = mover_map.get(item['symbol'])
        if mover and mover['change3dPercent'] < -2:
            short_candidates.append({
                **item,
                'change3dPercent': mover['change3dPercent'],
                'signal': 'SHORT',
                'confidence': min(100, int((item['rsi1h'] - 70) * 3 + abs(mover['change3dPercent']))),
            })

    return sorted(
        long_candidates + short_candidates,
        key=lambda x: x['confidence'],
        reverse=True,
    )


# ── Helpers ──────────────────────────────────────────────────────────────────
def _normalize_account(account: dict) -> dict:
    return {
        'totalWalletBalance': float(account.get('totalWalletBalance', 0)),
        'totalUnrealizedProfit': float(account.get('totalUnrealizedProfit', 0)),
        'totalMarginBalance': float(account.get('totalMarginBalance', 0)),
        'availableBalance': float(account.get('availableBalance', 0)),
        'totalMaintMargin': float(account.get('totalMaintMargin', 0)),
        'totalPositionInitialMargin': float(account.get('totalPositionInitialMargin', 0)),
        'assets': [
            {
                'asset': a.get('asset', ''),
                'walletBalance': float(a.get('walletBalance', 0)),
                'unrealizedProfit': float(a.get('unrealizedProfit', 0)),
                'marginBalance': float(a.get('marginBalance', 0)),
                'availableBalance': float(a.get('availableBalance', 0)),
            }
            for a in account.get('assets', [])
            if float(a.get('walletBalance', 0)) > 0
        ],
    }


def _ts_to_iso(timestamp_ms: int) -> str:
    import datetime
    return datetime.datetime.fromtimestamp(
        timestamp_ms / 1000.0, tz=datetime.timezone.utc
    ).isoformat()