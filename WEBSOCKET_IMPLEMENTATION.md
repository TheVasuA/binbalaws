# Live Balance WebSocket Implementation

This document describes the real-time WebSocket implementation for Binance Futures and Spot trading.

## Overview

The application now uses **Binance User Data Streams** via WebSocket for real-time updates of:
- Account balance
- Open positions (Futures)
- Position changes (Futures)
- Open orders
- Order executions
- Balance updates (Spot)

## Architecture

### Dual Connection Strategy

The implementation uses a **hybrid approach** combining:

1. **WebSocket Connection** (Primary - Real-time)
   - Direct connection to Binance User Data Stream
   - Instant updates for balance, positions, and orders
   - Sub-second latency

2. **Server-Sent Events (SSE)** (Fallback - Polling)
   - Periodic snapshots every 5 seconds
   - Ensures data consistency
   - Fallback if WebSocket fails

### Components

#### 1. `src/lib/binanceWS.js`

Two main hooks:

##### `useBinanceFuturesStream({ initialData })`

**Returns:**
```javascript
{
  account: {
    totalWalletBalance: number,
    availableBalance: number,
    totalUnrealizedProfit: number,
    currentBalance: number
  },
  positions: Array<Position>,
  openOrders: Array<Order>,
  connected: boolean,      // SSE connection status
  wsConnected: boolean,    // WebSocket connection status
  error: string | null
}
```

**Features:**
- Real-time position updates
- Live unrealized P&L
- Order execution notifications
- Automatic reconnection with exponential backoff
- ListenKey keep-alive (30-minute intervals)

##### `useBinanceSpotStream({ initialData })`

**Returns:**
```javascript
{
  holdings: Array<Holding>,
  totalValue: number,
  connected: boolean,
  wsConnected: boolean,
  error: string | null
}
```

**Features:**
- Real-time balance updates
- Spot order execution tracking
- Automatic reconnection

#### 2. `src/app/api/listenkey/route.js`

API endpoints for managing Binance ListenKeys:

- **GET** `/api/listenkey?type=futures|spot` - Create new listenKey
- **PUT** `/api/listenkey?type=futures|spot&listenKey=xxx` - Keep-alive
- **DELETE** `/api/listenkey?type=futures|spot&listenKey=xxx` - Close listenKey

#### 3. `src/app/api/futures/stream/route.js`

Server-Sent Events endpoint providing:
- Initial snapshot
- Periodic patches (every 5 seconds)
- Fallback data source

## WebSocket Events

### Futures Events

#### `ACCOUNT_UPDATE`
Triggered when:
- Position is opened/closed
- Balance changes
- Margin changes

**Payload:**
```javascript
{
  e: "ACCOUNT_UPDATE",
  a: {
    B: [{ a: "USDT", wb: "10000.00", cw: "9500.00" }], // Balances
    P: [{ s: "BTCUSDT", pa: "0.5", ep: "50000", ... }] // Positions
  }
}
```

#### `ORDER_TRADE_UPDATE`
Triggered when:
- Order is placed
- Order is filled
- Order is canceled

**Payload:**
```javascript
{
  e: "ORDER_TRADE_UPDATE",
  o: {
    s: "BTCUSDT",
    i: 12345,
    X: "FILLED",
    ...
  }
}
```

### Spot Events

#### `outboundAccountPosition`
Full account balance snapshot

#### `balanceUpdate`
Individual balance change

#### `executionReport`
Order execution update

## Connection Flow

```
1. Component mounts
   ↓
2. Fetch listenKey from /api/listenkey
   ↓
3. Connect to wss://fstream.binance.com/ws/{listenKey}
   ↓
4. Start keep-alive interval (30 min)
   ↓
5. Listen for events and update state
   ↓
6. On disconnect: exponential backoff retry
   ↓
7. On unmount: close WebSocket and delete listenKey
```

## Configuration

### Environment Variables

```bash
# .env or .env.local
BINANCE_API_KEY=your_api_key
BINANCE_API_SECRET=your_api_secret
BINANCE_TESTNET=false  # Set to 'true' for testnet

# Client-side (optional)
NEXT_PUBLIC_BINANCE_TESTNET=false
```

### WebSocket URLs

**Production:**
- Futures: `wss://fstream.binance.com/ws/{listenKey}`
- Spot: `wss://stream.binance.com:9443/ws/{listenKey}`

**Testnet:**
- Futures: `wss://stream.binancefuture.com/ws/{listenKey}`
- Spot: `wss://testnet.binance.vision/ws/{listenKey}`

## Usage Example

### Futures Dashboard

```javascript
import { useBinanceFuturesStream } from '@/lib/binanceWS';

export default function FuturesDashboard({ initialData }) {
  const { 
    account, 
    positions, 
    openOrders, 
    connected, 
    wsConnected, 
    error 
  } = useBinanceFuturesStream({ initialData });

  return (
    <div>
      <div>
        Status: {wsConnected ? '🟢 Live' : connected ? '🟡 Polling' : '🔴 Disconnected'}
      </div>
      
      <div>Balance: ${account?.currentBalance?.toFixed(2)}</div>
      
      <div>
        {positions.map(pos => (
          <div key={pos.symbol}>
            {pos.symbol}: {pos.side} {pos.positionAmt} @ ${pos.entryPrice}
            <br />
            P&L: ${pos.unrealizedProfit.toFixed(2)}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Spot Portfolio

```javascript
import { useBinanceSpotStream } from '@/lib/binanceWS';

export default function SpotPortfolio({ initialData }) {
  const { 
    holdings, 
    totalValue, 
    wsConnected, 
    error 
  } = useBinanceSpotStream({ initialData });

  return (
    <div>
      <div>Status: {wsConnected ? '🟢 Live' : '🔴 Disconnected'}</div>
      <div>Total Value: ${totalValue.toFixed(2)}</div>
      
      {holdings.map(holding => (
        <div key={holding.currency}>
          {holding.currency}: {holding.amount} (${holding.valueUSD.toFixed(2)})
        </div>
      ))}
    </div>
  );
}
```

## Error Handling

### Automatic Reconnection

- **Max retries:** 5
- **Backoff strategy:** Exponential (1s, 2s, 4s, 8s, 16s, 30s max)
- **Keep-alive:** 30-minute intervals to prevent timeout

### Error States

```javascript
if (error) {
  // Display error to user
  console.error('WebSocket error:', error);
}

if (!wsConnected && !connected) {
  // Both connections failed - show offline mode
}

if (!wsConnected && connected) {
  // WebSocket failed but SSE working - degraded mode
}
```

## Performance Considerations

### Latency
- **WebSocket:** < 100ms (real-time)
- **SSE Polling:** 5 seconds (fallback)

### Data Efficiency
- WebSocket sends only **changes** (deltas)
- SSE sends full snapshots periodically
- ListenKey reused across reconnections

### Resource Usage
- Single WebSocket per market type (Futures/Spot)
- Automatic cleanup on unmount
- Keep-alive prevents unnecessary reconnections

## Security

### API Key Protection
- API keys stored server-side only
- ListenKey generated server-side
- Client never sees API credentials

### ListenKey Lifecycle
1. Created on connection
2. Kept alive every 30 minutes
3. Deleted on disconnect
4. Auto-expires after 60 minutes of inactivity

## Troubleshooting

### WebSocket Not Connecting

**Check:**
1. API keys configured correctly
2. Network allows WebSocket connections
3. Firewall not blocking WSS protocol
4. Browser console for errors

**Solution:**
```javascript
// Enable debug logging
console.log('[Binance WS] Connection status:', wsConnected);
```

### Frequent Disconnections

**Possible causes:**
- Network instability
- ListenKey expired (keep-alive failed)
- API key permissions

**Solution:**
- Check keep-alive interval logs
- Verify API key has User Data Stream permission
- Monitor network stability

### Data Not Updating

**Check:**
1. `wsConnected` status
2. Browser console for WebSocket messages
3. Position actually changed on Binance

**Debug:**
```javascript
ws.onmessage = (event) => {
  console.log('[DEBUG] Raw message:', event.data);
  // ... rest of handler
};
```

## Testing

### Manual Testing

1. **Open position:**
   - Place market order
   - Verify position appears instantly
   - Check P&L updates in real-time

2. **Close position:**
   - Close position on Binance
   - Verify removal from UI

3. **Reconnection:**
   - Disable network
   - Wait 10 seconds
   - Re-enable network
   - Verify automatic reconnection

### Testnet Testing

```bash
# .env.local
BINANCE_TESTNET=true
NEXT_PUBLIC_BINANCE_TESTNET=true
```

Use Binance Futures Testnet for risk-free testing.

## Future Enhancements

- [ ] Add WebSocket for market data (ticker prices)
- [ ] Implement order book streaming
- [ ] Add trade history streaming
- [ ] Support multiple accounts
- [ ] Add WebSocket connection metrics
- [ ] Implement circuit breaker pattern
- [ ] Add message queue for offline resilience

## References

- [Binance Futures WebSocket API](https://binance-docs.github.io/apidocs/futures/en/#websocket-market-streams)
- [Binance User Data Streams](https://binance-docs.github.io/apidocs/futures/en/#user-data-streams)
- [ListenKey Management](https://binance-docs.github.io/apidocs/futures/en/#start-user-data-stream-user_stream)

## Support

For issues or questions:
1. Check browser console for WebSocket logs
2. Verify API key permissions
3. Test with Binance Testnet first
4. Review Binance API status page
