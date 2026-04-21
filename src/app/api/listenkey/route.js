import { NextResponse } from 'next/server';
import axios from 'axios';

const SPOT_BASE =
  process.env.BINANCE_TESTNET === 'true'
    ? 'https://testnet.binance.vision'
    : 'https://api.binance.com';

const FUTURES_BASE =
  process.env.BINANCE_TESTNET === 'true'
    ? 'https://testnet.binancefuture.com'
    : 'https://fapi.binance.com';

function getApiKey() {
  const key = process.env.BINANCE_API_KEY?.trim();
  if (!key) throw new Error('API keys not configured');
  return key;
}

// GET /api/listenkey?type=futures|spot -> create a new listenKey
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'futures';
    const apiKey = getApiKey();

    let response;
    if (type === 'spot') {
      response = await axios.post(`${SPOT_BASE}/api/v3/userDataStream`, null, {
        headers: { 'X-MBX-APIKEY': apiKey },
      });
    } else {
      response = await axios.post(`${FUTURES_BASE}/fapi/v1/listenKey`, null, {
        headers: { 'X-MBX-APIKEY': apiKey },
      });
    }

    return NextResponse.json({ success: true, listenKey: response.data.listenKey });
  } catch (error) {
    console.error('ListenKey GET error:', error.response?.data || error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/listenkey?type=futures|spot&listenKey=xxx -> keepalive
export async function PUT(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'futures';
    const listenKey = searchParams.get('listenKey');

    if (!listenKey) {
      return NextResponse.json({ error: 'listenKey required' }, { status: 400 });
    }

    const apiKey = getApiKey();

    if (type === 'spot') {
      await axios.put(`${SPOT_BASE}/api/v3/userDataStream`, null, {
        params: { listenKey },
        headers: { 'X-MBX-APIKEY': apiKey },
      });
    } else {
      await axios.put(`${FUTURES_BASE}/fapi/v1/listenKey`, null, {
        params: { listenKey },
        headers: { 'X-MBX-APIKEY': apiKey },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('ListenKey PUT error:', error.response?.data || error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/listenkey?type=futures|spot&listenKey=xxx -> close listenKey
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'futures';
    const listenKey = searchParams.get('listenKey');

    if (!listenKey) {
      return NextResponse.json({ error: 'listenKey required' }, { status: 400 });
    }

    const apiKey = getApiKey();

    if (type === 'spot') {
      await axios.delete(`${SPOT_BASE}/api/v3/userDataStream`, {
        params: { listenKey },
        headers: { 'X-MBX-APIKEY': apiKey },
      });
    } else {
      await axios.delete(`${FUTURES_BASE}/fapi/v1/listenKey`, {
        params: { listenKey },
        headers: { 'X-MBX-APIKEY': apiKey },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('ListenKey DELETE error:', error.response?.data || error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
