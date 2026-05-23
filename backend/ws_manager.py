"""WebSocket manager — connects to Binance futures streams server-side and
broadcasts price updates to all connected frontend clients via FastAPI WebSocket.

Design:
  - Backend maintains ≤5 persistent WebSocket connections to Binance.
  - Each Binance WS connection carries up to 150 stream IDs.
  - All 10 users share the same backend → single IP to Binance.
  - Frontend clients connect via a single FastAPI WS endpoint (/ws/prices).
  - Backend fans out mark-price ticks to every subscribed client.
  - When positions change, the frontend sends a subscribe message with new symbols.
"""

import asyncio
import json
import time
import logging
from typing import Optional, Any
from collections import defaultdict

import websockets
from websockets.asyncio.client import connect as ws_connect

from .config import (
    BINANCE_TESTNET,
    WS_STREAMS_PER_CONNECTION,
    WS_MAX_CONNECTIONS,
)

logger = logging.getLogger(__name__)

BINANCE_WS_BASE = (
    'wss://stream.binancefuture.com'
    if BINANCE_TESTNET
    else 'wss://fstream.binance.com'
)

# Global state
_latest_prices: dict[str, float] = {}  # symbol.lower() → price
_clients: dict[str, dict] = {}           # client_id → {'ws': WebSocket, 'symbols': set, 'subscriptions': set}
_subscriptions: defaultdict[str, set] = defaultdict(set)  # stream_name → {client_id, ...}
_binance_connections: list[Any] = []     # active Binance WS connections
_lock = asyncio.Lock()
_running = False
_worker_task: Optional[asyncio.Task] = None


async def _binance_reconnect_loop(
    streams: list[str],
    connection_index: int,
):
    """Maintain a persistent Binance WS connection for a chunk of streams."""
    base_delay = 2.0
    max_delay = 60.0
    delay = base_delay

    while _running:
        url = f'{BINANCE_WS_BASE}/stream?streams={"/".join(streams)}'
        logger.info(f'[BinanceWS #{connection_index}] Connecting with {len(streams)} streams...')
        try:
            async with ws_connect(url, ping_interval=60, ping_timeout=15) as ws:
                logger.info(f'[BinanceWS #{connection_index}] ✅ Connected')
                delay = base_delay
                async for msg in ws:
                    if not _running:
                        break
                    try:
                        payload = json.loads(msg)
                        data = payload.get('data')
                        if not data or 's' not in data or 'c' not in data:
                            continue
                        sym = data['s'].lower()
                        price = float(data['c'])
                        _latest_prices[sym] = price

                        # Fan-out to subscribed clients
                        stream_name = f'{sym}@miniTicker'
                        client_ids = _subscriptions.get(stream_name, set())
                        dead_clients = []
                        for cid in list(client_ids):
                            client_info = _clients.get(cid)
                            if not client_info:
                                dead_clients.append(cid)
                                continue
                            try:
                                await client_info['ws'].send_text(json.dumps({
                                    'type': 'price',
                                    'symbol': sym,
                                    'price': price,
                                    'timestamp': int(time.time() * 1000),
                                }))
                            except Exception:
                                dead_clients.append(cid)
                        for cid in dead_clients:
                            await _remove_client(cid)
                    except Exception:
                        continue
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f'[BinanceWS #{connection_index}] Disconnected: {e}')
            if not _running:
                break
            await asyncio.sleep(delay)
            delay = min(delay * 1.5, max_delay)


async def _remove_client(client_id: str):
    """Clean up a disconnected client."""
    async with _lock:
        client_info = _clients.pop(client_id, None)
        if not client_info:
            return
        # Remove this client from all subscriptions
        for stream in client_info.get('subscriptions', set()):
            _subscriptions[stream].discard(client_id)
        logger.info(f'[Clients] Removed client {client_id}, total={len(_clients)}')


async def _rebuild_binance_connections():
    """Recompute stream chunks and restart Binance WS connections."""
    global _binance_connections, _worker_task

    # Cancel existing connections
    for task in _binance_connections:
        task.cancel()
    _binance_connections = []

    # Collect all unique stream names needed
    all_streams = sorted(_subscriptions.keys())
    if not all_streams:
        logger.info('[BinanceWS] No streams to subscribe, keeping connections idle')
        return

    # Chunk streams into groups of WS_STREAMS_PER_CONNECTION
    chunks = [
        all_streams[i : i + WS_STREAMS_PER_CONNECTION]
        for i in range(0, len(all_streams), WS_STREAMS_PER_CONNECTION)
    ]
    # Limit to WS_MAX_CONNECTIONS
    chunks = chunks[:WS_MAX_CONNECTIONS]

    logger.info(
        f'[BinanceWS] Rebuilding: {len(all_streams)} streams → '
        f'{len(chunks)} Binance connections'
    )

    for idx, chunk in enumerate(chunks):
        task = asyncio.create_task(_binance_reconnect_loop(chunk, idx))
        _binance_connections.append(task)


async def handle_client(ws, client_id: str):
    """Handle a frontend client WebSocket connection.

    Protocol:
      Client → Server:
        {"type": "subscribe", "symbols": ["btcusdt", "ethusdt", ...]}
        {"type": "unsubscribe"}
        {"type": "ping"}

      Server → Client:
        {"type": "price", "symbol": "btcusdt", "price": 45678.90, "timestamp": 1234567890}
        {"type": "pong"}
        {"type": "error", "message": "..."}
        {"type": "subscribed", "symbols": ["btcusdt", ...]}
    """
    global _running
    async with _lock:
        _clients[client_id] = {
            'ws': ws,
            'symbols': set(),
            'subscriptions': set(),
        }
    logger.info(f'[Clients] Connected {client_id}, total={len(_clients)}')

    try:
        async for msg_text in ws.iter_text():
            if not _running:
                break
            try:
                msg = json.loads(msg_text)
            except json.JSONDecodeError:
                await ws.send_text(json.dumps({'type': 'error', 'message': 'Invalid JSON'}))
                continue

            msg_type = msg.get('type', '')

            if msg_type == 'ping':
                await ws.send_text(json.dumps({'type': 'pong'}))
                continue

            if msg_type == 'subscribe':
                symbols = [
                    s.strip().lower()
                    for s in (msg.get('symbols') or [])
                    if isinstance(s, str)
                ]
                if not symbols:
                    await ws.send_text(json.dumps({'type': 'error', 'message': 'No symbols provided'}))
                    continue

                async with _lock:
                    client_info = _clients.get(client_id)
                    if not client_info:
                        break
                    new_subs = set()
                    for sym in symbols:
                        stream = f'{sym}@miniTicker'
                        if stream not in client_info['subscriptions']:
                            client_info['subscriptions'].add(stream)
                            _subscriptions[stream].add(client_id)
                            new_subs.add(sym)

                await ws.send_text(json.dumps({
                    'type': 'subscribed',
                    'symbols': list(new_subs),
                }))

                if new_subs:
                    await _rebuild_binance_connections()

                # Send latest cached prices immediately
                price_snapshot = {
                    sym: _latest_prices[sym]
                    for sym in symbols
                    if sym in _latest_prices
                }
                if price_snapshot:
                    await ws.send_text(json.dumps({
                        'type': 'snapshot',
                        'prices': price_snapshot,
                        'timestamp': int(time.time() * 1000),
                    }))

            elif msg_type == 'unsubscribe':
                async with _lock:
                    client_info = _clients.get(client_id)
                    if not client_info:
                        break
                    for stream in client_info['subscriptions']:
                        _subscriptions[stream].discard(client_id)
                    client_info['subscriptions'].clear()
                await _rebuild_binance_connections()
                await ws.send_text(json.dumps({
                    'type': 'unsubscribed',
                }))

    except Exception as e:
        logger.warning(f'[Clients] {client_id} error: {e}')
    finally:
        await _remove_client(client_id)


async def start_ws_manager():
    """Start the WebSocket manager."""
    global _running
    _running = True
    logger.info('[WSManager] Started')


async def stop_ws_manager():
    """Stop the WebSocket manager and clean up."""
    global _running, _binance_connections
    _running = False
    for task in _binance_connections:
        task.cancel()
    _binance_connections = []
    # Close all client connections
    async with _lock:
        for cid, info in list(_clients.items()):
            try:
                await info['ws'].close()
            except Exception:
                pass
        _clients.clear()
        _subscriptions.clear()
    logger.info('[WSManager] Stopped')


def get_latest_prices() -> dict:
    """Return snapshot of latest prices."""
    return dict(_latest_prices)


def get_client_count() -> int:
    return len(_clients)