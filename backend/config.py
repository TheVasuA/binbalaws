"""Configuration loader for FastAPI backend."""
import os
from dotenv import load_dotenv

# Load from parent .env or backend-local .env
env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)

# ── Binance ──────────────────────────────────────────────────────────────────
BINANCE_API_KEY = os.getenv('BINANCE_API_KEY', '').strip()
BINANCE_API_SECRET = os.getenv('BINANCE_API_SECRET', '').strip()
BINANCE_TESTNET = os.getenv('BINANCE_TESTNET', 'false').lower() == 'true'

# ── Redis ────────────────────────────────────────────────────────────────────
UPSTASH_REDIS_REST_URL = os.getenv('UPSTASH_REDIS_REST_URL', '')
UPSTASH_REDIS_REST_TOKEN = os.getenv('UPSTASH_REDIS_REST_TOKEN', '')

# ── Server ───────────────────────────────────────────────────────────────────
HOST = os.getenv('BACKEND_HOST', '0.0.0.0')
PORT = int(os.getenv('BACKEND_PORT', '8000'))
CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:3000').split(',')

# ── Binance Rate Limits ──────────────────────────────────────────────────────
# Binance Futures API limits:
#   - 2400 req/min per IP for public endpoints
#   - 2400 req/min per IP for authenticated endpoints
#   - WebSocket: 200 streams per connection max
#   - 10 connections per IP for WS
REQUESTS_PER_MINUTE = 1200          # Conservative: half of limit
REQUESTS_PER_SECOND = 20             # Max burst
WS_STREAMS_PER_CONNECTION = 150     # Conservative limit per WS conn
WS_MAX_CONNECTIONS = 5               # Max Binance WS connections from this backend

# ── Polling Intervals (seconds) ──────────────────────────────────────────────
ACCOUNT_POLL_INTERVAL = 15
POSITION_POLL_INTERVAL = 10
MARK_PRICE_POLL_INTERVAL = 5
SYMBOL_SCAN_INTERVAL = 300           # 5 minutes for RSI / 3d scans

# ── User Management ──────────────────────────────────────────────────────────
MAX_USERS = 10