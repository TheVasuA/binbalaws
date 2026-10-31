import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

// Server-shared "who is watching the portfolio" state so User A/B toggles sync
// across every system/browser (not just one). Stored as an array of ids in
// Redis under a single key; the dashboard polls this every few seconds.
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KV_KEY = 'portfolio_watchers';
const VALID = new Set(['A', 'B']);

function clean(list) {
  const arr = Array.isArray(list) ? list : [];
  // Canonical order (A before B), valid ids only, deduped.
  return ['A', 'B'].filter((id) => arr.map(String).includes(id) && VALID.has(id));
}

export async function GET() {
  try {
    const data = await redis.get(KV_KEY);
    return NextResponse.json({ watchers: clean(data) });
  } catch (error) {
    console.error('Watcher GET error:', error);
    return NextResponse.json({ watchers: [] });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const watchers = clean(body?.watchers);
    await redis.set(KV_KEY, watchers);
    return NextResponse.json({ success: true, watchers });
  } catch (error) {
    console.error('Watcher POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
