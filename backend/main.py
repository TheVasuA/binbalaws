"""FastAPI backend — Binance Futures dashboard server.

Routes:
  GET  /api/health         — Health check
  GET  /api/futures/acct   — Account balance + wallet
  GET  /api/futures/positions — Open positions
  GET  /api/futures/orders   — Open orders
  GET  /api/mark-prices     — All mark prices
  GET  /api/symbols         — Futures symbols list
  GET  /api/rsi-scan        — 1h RSI scan (below30 / above70)
  GET  /api/3d-movers       — 3-day price movers
  GET  /api/high-confidence — Combined entry signals
  POST /api/order/place     — Place market order
  POST /api/order/exit      — Place SL/TP exit orders
  POST /api/order/close     — Close position
  WS   /ws/prices           — Live price stream (server-side Binance WS)

Binance Rate Limit Architecture:
  - Token-bucket limiter: 1200 req/min per bucket (public + auth)
  - 5 persistent WS connections to Binance, each ≤150 streams
  - All 10 users share same backend IP → single Binance IP
  - Heavy endpoints (exchangeInfo, ticker/24hr) are called within
    cache-then-refresh patterns in the scanner functions
"""

import asyncio
import json
import time
import uuid
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import (
    CORS_ORIGINS,
    MAX_USERS,
    ACCOUNT_POLL_INTERVAL,
    POSITION_POLL_INTERVAL,
    SYMBOL_SCAN_INTERVAL,
)
from .rate_limiter import public_limiter, auth_limiter
from .binance_client import (
    get_futures_account,
    get_positions,
    get_open_orders,
    get_mark_prices,
    get_futures_symbols,
    scan_rsi_1h,
    scan_3d_movers,
    scan_high_confidence_entries,
    place_market_order,
    set_leverage,
    place_exit_orders,
    close_position,
    close_client,
)
from .ws_manager import (
    handle_client,
    start_ws_manager,
    stop_ws_manager,
    get_latest_prices,
    get_client_count,
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
)
logger = logging.getLogger(__name__)


# ── Cached scanning data ────────────────────────────────────────────────────
_cached_rsi_scan: Optional[dict] = None
_cached_3d_movers: Optional[list] = None
_cached_high_confidence: Optional[list] = None
_cache_lock = asyncio.Lock()
_scan_task: Optional[asyncio.Task] = None


async def _periodic_scan_loop():
    """Background task that refreshes symbol scans every SYMBOL_SCAN_INTERVAL."""
    global _cached_rsi_scan, _cached_3d_movers, _cached_high_confidence
    while True:
        try:
            logger.info('[Scanner] Starting periodic scan...')
            rsi_data = await scan_rsi_1h(280)
            movers = await scan_3d_movers(40)
            entries = await scan_high_confidence_entries()
            async with _cache_lock:
                _cached_rsi_scan = rsi_data
                _cached_3d_movers = movers
                _cached_high_confidence = entries
            logger.info(
                f'[Scanner] Done — RSI: {len(rsi_data.get("below30", []))} oversold / '
                f'{len(rsi_data.get("above70", []))} overbought, '
                f'3d movers: {len(movers)}, entries: {len(entries)}'
            )
        except Exception as e:
            logger.error(f'[Scanner] Error: {e}')
        await asyncio.sleep(SYMBOL_SCAN_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info('🚀 Starting Binance Futures backend...')
    await start_ws_manager()

    # Start periodic scan task
    global _scan_task
    _scan_task = asyncio.create_task(_periodic_scan_loop())

    yield

    logger.info('🛑 Shutting down...')
    if _scan_task:
        _scan_task.cancel()
    await stop_ws_manager()
    await close_client()
    logger.info('✅ Shutdown complete')


# ── FastAPI App ─────────────────────────────────────────────────────────────
app = FastAPI(
    title='Binance Futures Dashboard API',
    version='2.0.0',
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


# ── Health ──────────────────────────────────────────────────────────────────
@app.get('/api/health')
async def health_check():
    return {
        'status': 'ok',
        'clients': get_client_count(),
        'max_clients': MAX_USERS,
        'public_weight': public_limiter.used_weight_1m,
        'auth_weight': auth_limiter.used_weight_1m,
        'latest_prices_count': len(get_latest_prices()),
    }


# ── REST: Account & Positions ───────────────────────────────────────────────
@app.get('/api/futures/acct')
async def futures_account():
    """Get futures account balance, wallet, margin info."""
    try:
        account = await get_futures_account()
        return JSONResponse({
            'success': True,
            'data': account,
            **public_limiter.get_headers(),
        })
    except Exception as e:
        return JSONResponse({
            'success': False,
            'error': str(e),
        }, status_code=500)


@app.get('/api/futures/positions')
async def futures_positions():
    """Get all open futures positions with SL/TP info."""
    try:
        positions = await get_positions()
        return JSONResponse({
            'success': True,
            'data': positions,
            **public_limiter.get_headers(),
        })
    except Exception as e:
        return JSONResponse({
            'success': False,
            'error': str(e),
        }, status_code=500)


@app.get('/api/futures/orders')
async def futures_orders(symbol: Optional[str] = Query(None)):
    """Get open futures orders."""
    try:
        orders = await get_open_orders(symbol)
        return JSONResponse({
            'success': True,
            'data': orders,
            **public_limiter.get_headers(),
        })
    except Exception as e:
        return JSONResponse({
            'success': False,
            'error': str(e),
        }, status_code=500)


@app.get('/api/mark-prices')
async def mark_prices():
    """Get all mark prices, funding rates."""
    try:
        prices = await get_mark_prices()
        return JSONResponse({
            'success': True,
            'data': prices,
            **public_limiter.get_headers(),
        })
    except Exception as e:
        return JSONResponse({
            'success': False,
            'error': str(e),
        }, status_code=500)


@app.get('/api/symbols')
async def symbols_list():
    """Get all tradable perpetual futures symbols."""
    try:
        symbols = await get_futures_symbols()
        return JSONResponse({
            'success': True,
            'data': symbols,
            **public_limiter.get_headers(),
        })
    except Exception as e:
        return JSONResponse({
            'success': False,
            'error': str(e),
        }, status_code=500)


# ── REST: Symbol Scanning ───────────────────────────────────────────────────
@app.get('/api/rsi-scan')
async def rsi_scan(limit: int = Query(280, ge=20, le=280)):
    """Get 1h RSI scan results (below30 / above70).

    Uses cached data if available, falls back to fresh scan.
    """
    async with _cache_lock:
        data = _cached_rsi_scan
    if data is None:
        try:
            data = await scan_rsi_1h(limit)
            async with _cache_lock:
                _cached_rsi_scan = data
        except Exception as e:
            return JSONResponse({
                'success': False,
                'error': str(e),
            }, status_code=500)

    return JSONResponse({
        'success': True,
        'data': data,
        'cached': _cached_rsi_scan is not None and data is _cached_rsi_scan,
        **public_limiter.get_headers(),
    })


@app.get('/api/3d-movers')
async def three_day_movers(limit: int = Query(40, ge=1, le=100)):
    """Get top 3-day price movers (positive → negative % change)."""
    async with _cache_lock:
        data = _cached_3d_movers
    if data is None:
        try:
            data = await scan_3d_movers(limit)
            async with _cache_lock:
                _cached_3d_movers = data
        except Exception as e:
            return JSONResponse({
                'success': False,
                'error': str(e),
            }, status_code=500)

    # Slice to requested limit
    result = data[:limit] if data else []
    return JSONResponse({
        'success': True,
        'data': result,
        'cached': data is _cached_3d_movers if data else False,
        **public_limiter.get_headers(),
    })


@app.get('/api/high-confidence')
async def high_confidence_entries(
    min_rsi: float = Query(25.0, ge=0, le=100),
    max_rsi: float = Query(75.0, ge=0, le=100),
):
    """Get high-confidence trade entries (LONG oversold + SHORT overbought)."""
    async with _cache_lock:
        data = _cached_high_confidence
    if data is None:
        try:
            data = await scan_high_confidence_entries(min_rsi, max_rsi)
            async with _cache_lock:
                _cached_high_confidence = data
        except Exception as e:
            return JSONResponse({
                'success': False,
                'error': str(e),
            }, status_code=500)

    return JSONResponse({
        'success': True,
        'data': data,
        'cached': data is _cached_high_confidence if data else False,
        **public_limiter.get_headers(),
    })

@app.get('/api/scan/refresh')
async def refresh_scans():
    """Force-refresh all symbol scans."""
    global _cached_rsi_scan
    global _cached_3d_movers
    global _cached_high_confidence
    try:
        rsi_data = await scan_rsi_1h()
        movers = await scan_3d_movers(40)
        entries = await scan_high_confidence_entries()
        async with _cache_lock:
            _cached_rsi_scan = rsi_data
            _cached_3d_movers = movers
            _cached_high_confidence = entries
        return JSONResponse({
            'success': True,
            'data': {
                'rsi': {'below30': len(rsi_data.get('below30', [])),
                        'above70': len(rsi_data.get('above70', []))},
                'movers': len(movers),
                'entries': len(entries),
            },
            **public_limiter.get_headers(),
        })
    except Exception as e:
        return JSONResponse({
            'success': False,
            'error': str(e),
        }, status_code=500)


# ── REST: Order Placement ───────────────────────────────────────────────────
from pydantic import BaseModel, Field

class PlaceOrderRequest(BaseModel):
    symbol: str = Field(..., min_length=2)
    side: str = Field(..., pattern='^(BUY|SELL|buy|sell)$')
    quantity: float = Field(..., gt=0)
    leverage: Optional[int] = Field(None, ge=1, le=125)
    stopLossPrice: Optional[float] = Field(None, gt=0)
    takeProfitPrice: Optional[float] = Field(None, gt=0)

@app.post('/api/order/place')
async def place_order(req: PlaceOrderRequest):
    """Place a market order with optional leverage and SL/TP exits."""
    try:
        # Set leverage first if specified
        lev_result = None
        if req.leverage:
            lev_result = await set_leverage(req.symbol, req.leverage)

        # Place market order
        order_result = await place_market_order(req.symbol, req.side, req.quantity)

        # Place SL/TP if requested
        exit_result = None
        if req.stopLossPrice or req.takeProfitPrice:
            exit_result = await place_exit_orders(
                req.symbol, req.side,
                req.stopLossPrice, req.takeProfitPrice,
            )

        return JSONResponse({
            'success': True,
            'data': {
                'order': order_result,
                'leverage': lev_result,
                'exits': exit_result,
            },
        })
    except Exception as e:
        return JSONResponse({
            'success': False,
            'error': str(e),
        }, status_code=500)


class PlaceExitRequest(BaseModel):
    symbol: str = Field(..., min_length=2)
    entrySide: str = Field(..., pattern='^(BUY|SELL|buy|sell)$')
    stopLossPrice: Optional[float] = Field(None, gt=0)
    takeProfitPrice: Optional[float] = Field(None, gt=0)

@app.post('/api/order/exit')
async def place_exit(req: PlaceExitRequest):
    """Place SL/TP exit orders for an existing position."""
    try:
        result = await place_exit_orders(
            req.symbol, req.entrySide,
            req.stopLossPrice, req.takeProfitPrice,
        )
        return JSONResponse({
            'success': True,
            'data': result,
        })
    except Exception as e:
        return JSONResponse({
            'success': False,
            'error': str(e),
        }, status_code=500)


class ClosePositionRequest(BaseModel):
    symbol: str = Field(..., min_length=2)
    side: str = Field(..., pattern='^(LONG|SHORT|long|short)$')
    quantity: float = Field(..., gt=0)

@app.post('/api/order/close')
async def close_position_route(req: ClosePositionRequest):
    """Close a position with a reduce-only market order."""
    try:
        result = await close_position(req.symbol, req.side, req.quantity)
        return JSONResponse({
            'success': True,
            'data': result,
        })
    except Exception as e:
        return JSONResponse({
            'success': False,
            'error': str(e),
        }, status_code=500)


# ── WebSocket: Live Price Stream ────────────────────────────────────────────
@app.websocket('/ws/prices')
async def ws_prices(websocket: WebSocket):
    """WebSocket endpoint for live price updates.

    Clients connect here and receive real-time price ticks via the backend's
    Binance WebSocket connections. Protocol defined in ws_manager.py.
    """
    client_count = get_client_count()
    if client_count >= MAX_USERS:
        await websocket.close(code=1013, reason='Max users reached')
        return

    await websocket.accept()
    client_id = str(uuid.uuid4())[:8]
    logger.info(f'[WS] New client: {client_id}')

    try:
        await handle_client(websocket, client_id)
    except WebSocketDisconnect:
        logger.info(f'[WS] Client disconnected: {client_id}')
    except Exception as e:
        logger.error(f'[WS] Client {client_id} error: {e}')


# ── Run ─────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import uvicorn
    from .config import HOST, PORT
    uvicorn.run(
        'backend.main:app',
        host=HOST,
        port=PORT,
        reload=False,
        log_level='info',
    )