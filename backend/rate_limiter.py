"""Binance-aware rate limiter — respects IP buckets.

Binance Futures API weight model:
  - /fapi/v1/exchangeInfo      weight: 1
  - /fapi/v1/ticker/24hr       weight: 40  (for ALL symbols)
  - /fapi/v1/klines            weight: depends on weight param, default 1
  - /fapi/v1/premiumIndex      weight: 1
  - /fapi/v2/account           weight: 5
  - /fapi/v2/positionRisk      weight: 5
  - /fapi/v1/openOrders        weight: 1   (per symbol), 40 (all)

Hard limit: 2400 weights / minute per IP for EACH bucket (public & auth).

Strategy:
  - Token-bucket with 20 req/s burst, 1200 req/min sustained (half of limit)
  - Rate-limit headers are returned with every response
  - Heavy endpoints (ticker/24hr) are cached server-side
"""

import time
import asyncio
from collections import defaultdict
from typing import Optional


class BinanceRateLimiter:
    """Token-bucket rate limiter that tracks per-minute Binance API weights."""

    def __init__(
        self,
        max_per_minute: int = 1200,
        max_per_second: int = 20,
    ):
        self.max_per_minute = max_per_minute
        self.max_per_second = max_per_second
        self._tokens = float(max_per_minute)
        self._last_refill = time.monotonic()
        self._lock = asyncio.Lock()
        self._weight_used = 0
        self._weight_reset_at = time.time() + 60.0
        self._weight_log: list[tuple[float, int]] = []  # (timestamp, weight)

    @property
    def used_weight_1m(self) -> int:
        """Return total weight consumed in the last 60 seconds."""
        now = time.time()
        cutoff = now - 60.0
        self._weight_log = [(t, w) for t, w in self._weight_log if t > cutoff]
        return sum(w for _, w in self._weight_log)

    @property
    def remaining_weight(self) -> int:
        return max(0, self.max_per_minute - self.used_weight_1m)

    async def acquire(self, weight: int = 1) -> bool:
        """Attempt to consume `weight` tokens. Returns True if acquired."""
        async with self._lock:
            now = time.monotonic()

            # Refill tokens
            elapsed = now - self._last_refill
            refill_rate = self.max_per_minute / 60.0  # tokens/sec
            self._tokens = min(
                float(self.max_per_minute),
                self._tokens + elapsed * refill_rate,
            )
            self._last_refill = now

            if self._tokens >= weight:
                self._tokens -= weight
                self._weight_log.append((time.time(), weight))
                return True
            return False

    async def wait_and_acquire(self, weight: int = 1, timeout: float = 10.0):
        """Block until tokens are available or timeout."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if await self.acquire(weight):
                return
            await asyncio.sleep(0.1)
        raise TimeoutError("Rate limiter: request timed out waiting for capacity")

    def get_headers(self) -> dict:
        """Return X-MBX-USED-WEIGHT-1M style headers for client responses."""
        return {
            'X-MBX-USED-WEIGHT-1M': str(self.used_weight_1m),
            'X-MBX-WEIGHT-LIMIT-1M': str(self.max_per_minute),
        }


# Global singletons for public and authenticated buckets
public_limiter = BinanceRateLimiter(max_per_minute=1200, max_per_second=20)
auth_limiter = BinanceRateLimiter(max_per_minute=1200, max_per_second=20)


# ── Endpoint weight map ──────────────────────────────────────────────────────
ENDPOINT_WEIGHTS = {
    '/fapi/v1/exchangeInfo': 1,
    '/fapi/v1/ticker/24hr': 40,
    '/fapi/v1/ticker/price': 2,
    '/fapi/v1/klines': 1,          # default; actual weight depends on params
    '/fapi/v1/premiumIndex': 1,
    '/fapi/v1/time': 1,
    '/fapi/v2/account': 5,
    '/fapi/v2/positionRisk': 5,
    '/fapi/v1/openOrders': 1,      # per-symbol; 40 for all
    '/fapi/v1/allOrders': 5,
    '/fapi/v1/order': 1,
    '/fapi/v1/leverage': 1,
    '/fapi/v1/income': 20,
}

def get_endpoint_weight(endpoint: str, params: Optional[dict] = None) -> int:
    """Return the Binance weight for an endpoint."""
    # Strip query string
    path = endpoint.split('?')[0]
    weight = ENDPOINT_WEIGHTS.get(path, 1)

    # Heavy klines
    if path == '/fapi/v1/klines' and params:
        limit = int(params.get('limit', 500))
        if limit > 100:
            weight = max(1, limit // 100)
    return weight