// This SSE stream endpoint is DISABLED.
// Live updates are now delivered via the Binance WebSocket directly from the browser
// (see src/lib/binanceWS.js). Keeping this file to avoid 404s from any stale references.
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: 'SSE stream disabled – use WebSocket instead' },
    { status: 410 },
  );
}
