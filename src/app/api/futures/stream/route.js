// Server-Sent Events (SSE) price proxy.
//
// The browser cannot reliably receive Binance WebSocket data frames in some
// networks (a proxy/firewall lets the WS handshake through but drops the frames),
// which freezes live PnL / portfolio value. This endpoint sidesteps that: the
// Next.js server (which CAN reach Binance over REST) polls mark prices ~1/s and
// pushes them to the browser over plain HTTP via SSE.
//
// Usage (client): new EventSource('/api/futures/stream?symbols=btcusdt,ethusdt')
// Each message is JSON: { "BTCUSDT": 77210.6, "ETHUSDT": 3123.4, ... }

import { getFuturesMarkPrices } from '@/lib/binance';

export const dynamic = 'force-dynamic';

const POLL_MS = 1000; // push prices once per second

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = (searchParams.get('symbols') || '').trim();
  const wanted = symbolsParam
    ? new Set(symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))
    : null; // null = all symbols

  const encoder = new TextEncoder();
  let timer = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          // Controller already closed
        }
      };

      const tick = async () => {
        if (closed) return;
        try {
          const priceMap = await getFuturesMarkPrices();
          const out = {};
          for (const [symbol, info] of Object.entries(priceMap)) {
            if (wanted && !wanted.has(symbol)) continue;
            if (Number.isFinite(info.markPrice)) out[symbol] = info.markPrice;
          }
          if (Object.keys(out).length) send(out);
        } catch (err) {
          send({ error: err.message });
        }
      };

      // Initial hello + first prices immediately, then poll.
      send({ connected: true });
      await tick();
      timer = setInterval(tick, POLL_MS);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  // Abort cleanup when the client disconnects.
  request.signal?.addEventListener('abort', () => {
    closed = true;
    if (timer) clearInterval(timer);
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
