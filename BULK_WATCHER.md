# Bulk Scalp — Server-Side Auto-Exit Watcher

The Bulk Scalp page can auto-exit a basket of positions when the aggregate PnL
hits a take-profit or stop-loss threshold. The **watcher** runs that logic on
your VPS, so exits fire **24/7 — even with no browser open**.

## How it works

1. When you place a bulk order, the app records the basket (symbols, side,
   target/stop) in Redis under `bulk:basket:<id>`.
2. The watcher (`scripts/bulk-watcher.mjs`) polls Binance for live positions
   every few seconds, sums each basket's unrealized PnL (matched by symbol AND
   side), and closes all legs with reduce-only market orders when the target or
   stop is reached. The basket is then removed from Redis.
3. The page shows a green **"Server watcher managing this basket (24/7)"** badge
   when the watcher has picked up your basket, or a yellow "browser-only"
   warning when it hasn't (i.e. the watcher isn't running).

Only baskets **this app opened** are watched. Positions you open directly on
Binance are never touched (unless they share the same symbol + side as a basket
leg — Binance nets those into one position).

## Requirements

The watcher needs the same env as the app (put them in `.env`):

```
BINANCE_API_KEY=...
BINANCE_API_SECRET=...
BINANCE_TESTNET=false          # true = testnet
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

`BINANCE_API_KEY` must have **Futures trading** enabled. Do **not** enable
withdrawals.

Optional:

```
BULK_WATCHER_POLL_MS=3000      # poll interval in ms (default 3000)
```

## Run it

Quick test (foreground):

```bash
npm run watcher
# = node --env-file=.env scripts/bulk-watcher.mjs
```

You should see:

```
<ts> [bulk-watcher] Started. Polling every 3000ms. (LIVE)
```

### Production — PM2 (recommended)

```bash
npm install -g pm2

# Start both the Next.js app and the watcher
pm2 start "npm run start" --name bulk-app
pm2 start scripts/bulk-watcher.mjs --name bulk-watcher \
  --node-args="--env-file=.env"

pm2 save          # persist the process list
pm2 startup       # generate + install the boot script (run the printed command)
```

Useful:

```bash
pm2 logs bulk-watcher      # tail watcher logs
pm2 restart bulk-watcher   # restart after a code/.env change
pm2 status                 # see both processes
```

### Production — systemd (alternative)

Create `/etc/systemd/system/bulk-watcher.service`:

```ini
[Unit]
Description=Bulk Scalp auto-exit watcher
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/bindash          # your app path
ExecStart=/usr/bin/node --env-file=/opt/bindash/.env scripts/bulk-watcher.mjs
Restart=always
RestartSec=5
User=www-data                          # a non-root user that owns the app

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bulk-watcher
sudo journalctl -u bulk-watcher -f     # tail logs
```

## Safety notes

- The watcher **only ever closes the exact symbols** recorded in a basket via
  reduce-only market orders. It never does a blanket "close all".
- If a close partially fails, the basket is removed and any still-open leg
  simply becomes untracked (it won't be re-closed). Watch the logs.
- The watcher and the browser's client-side auto-exit are redundant by design —
  whichever fires first closes the basket; the other then sees no open legs and
  cleans up. Running the watcher means you're covered even if the tab is closed.
- Run **one** watcher instance per Binance account. Multiple instances polling
  the same baskets is harmless (the "closing" flag guards double-fires) but
  wastes API weight.
- Test on `BINANCE_TESTNET=true` first.
