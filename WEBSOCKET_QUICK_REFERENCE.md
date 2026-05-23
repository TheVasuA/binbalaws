# WebSocket Quick Reference

## Import

```javascript
import { useBinanceFuturesStream, useBinanceSpotStream } from '@/lib/binanceWS';
import ConnectionStatus from '@/components/ConnectionStatus';
```

## Basic Usage

### Futures
```javascript
const { 
  account,        // { totalWalletBalance, availableBalance, currentBalance, ... }
  positions,      // [{ symbol, side, positionAmt, entryPrice, unrealizedProfit, ... }]
  openOrders,     // [{ id, symbol, side, type, price, quantity, ... }]
  connected,      // SSE connection status (boolean)
  wsConnected,    // WebSocket connection status (boolean)
  error           // Error message (string | null)
} = useBinanceFuturesStream({ initialData });
```

### Spot
```javascript
const { 
  holdings,       // [{ currency, amount, valueUSD, change24h, ... }]
  totalValue,     // Total portfolio value in USD (number)
  connected,      // SSE connection status (boolean)
  wsConnected,    // WebSocket connection status (boolean)
  error           // Error message (string | null)
} = useBinanceSpotStream({ initialData });
```

## Connection Status Component

```javascript
<ConnectionStatus 
  wsConnected={wsConnected} 
  connected={connected} 
  error={error} 
/>
```

**Status Indicators:**
- 🟢 **Live** - WebSocket connected (< 100ms latency)
- 🟡 **Polling** - SSE fallback (5s updates)
- ⚪ **Disconnected** - Connecting/reconnecting
- 🔴 **Error** - Connection failed

## Environment Setup

```bash
# .env or .env.local
BINANCE_API_KEY=your_api_key
BINANCE_API_SECRET=your_api_secret
BINANCE_TESTNET=false  # true for testnet
```

## WebSocket URLs

| Environment | Futures | Spot |
|-------------|---------|------|
| **Production** | `wss://fstream.binance.com/ws/{key}` | `wss://stream.binance.com:9443/ws/{key}` |
| **Testnet** | `wss://stream.binancefuture.com/ws/{key}` | `wss://testnet.binance.vision/ws/{key}` |

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/listenkey?type=futures\|spot` | Create listenKey |
| PUT | `/api/listenkey?type=futures\|spot&listenKey=xxx` | Keep-alive |
| DELETE | `/api/listenkey?type=futures\|spot&listenKey=xxx` | Close listenKey |
| GET | `/api/futures/stream` | SSE fallback stream |

## WebSocket Events

### Futures
| Event | Trigger | Data Updated |
|-------|---------|--------------|
| `ACCOUNT_UPDATE` | Balance/position change | `account`, `positions` |
| `ORDER_TRADE_UPDATE` | Order placed/filled/canceled | `openOrders` |
| `ACCOUNT_CONFIG_UPDATE` | Leverage/margin change | `account` |

### Spot
| Event | Trigger | Data Updated |
|-------|---------|--------------|
| `outboundAccountPosition` | Full balance snapshot | `holdings` |
| `balanceUpdate` | Individual balance change | `holdings` |
| `executionReport` | Order execution | `holdings` |

## Data Structures

### Account (Futures)
```javascript
{
  totalWalletBalance: 10000.00,
  availableBalance: 9500.00,
  totalUnrealizedProfit: 150.00,
  currentBalance: 10150.00,  // wallet + unrealized
  totalMarginBalance: 10000.00,
  totalMaintMargin: 500.00,
  totalPositionInitialMargin: 500.00
}
```

### Position (Futures)
```javascript
{
  symbol: "BTCUSDT",
  side: "LONG",              // "LONG" | "SHORT"
  positionAmt: 0.5,
  entryPrice: 50000.00,
  markPrice: 51000.00,
  unrealizedProfit: 500.00,
  liquidationPrice: 45000.00,
  leverage: 10,
  isolatedMargin: 5000.00,
  notionalValue: 25500.00,
  stopLossPrice: 49000.00,   // if set
  stopLossValue: -500.00,    // if set
  takeProfitPrice: 52000.00, // if set
  takeProfitValue: 1000.00   // if set
}
```

### Order (Futures)
```javascript
{
  id: "12345",
  symbol: "BTCUSDT",
  side: "BUY",               // "BUY" | "SELL"
  type: "LIMIT",             // "LIMIT" | "MARKET" | "STOP_MARKET" | etc.
  price: 50000.00,
  stopPrice: 49500.00,       // for stop orders
  quantity: 0.5,
  filled: 0.0,
  status: "NEW",             // "NEW" | "FILLED" | "CANCELED" | etc.
  timestamp: 1621234567890
}
```

### Holding (Spot)
```javascript
{
  currency: "BTC",
  amount: 0.5,
  free: 0.4,
  used: 0.1,
  price: 50000.00,
  valueUSD: 25000.00,
  change24h: 2.5,            // percentage
  allocation: 50.0           // percentage of portfolio
}
```

## Common Patterns

### Display Balance
```javascript
<div>
  Balance: ${account?.currentBalance?.toFixed(2) || '0.00'}
</div>
```

### Display Position P&L
```javascript
{positions.map(pos => (
  <div key={pos.symbol}>
    {pos.symbol}: 
    <span className={pos.unrealizedProfit >= 0 ? 'text-green' : 'text-red'}>
      {pos.unrealizedProfit >= 0 ? '+' : ''}
      ${pos.unrealizedProfit.toFixed(2)}
    </span>
  </div>
))}
```

### Handle Loading State
```javascript
if (!account) {
  return <LoadingSpinner />;
}
```

### Handle Error State
```javascript
{error && (
  <div className="error-banner">
    <p>{error}</p>
    <button onClick={refetch}>Retry</button>
  </div>
)}
```

### Check Connection Status
```javascript
const isLive = wsConnected;
const isFallback = !wsConnected && connected;
const isOffline = !wsConnected && !connected;
```

## Lifecycle

```
Mount → Fetch listenKey → Connect WebSocket → Listen for events
  ↓                                              ↓
  ↓                                         Update state
  ↓                                              ↓
  ↓                                         Keep-alive (30min)
  ↓                                              ↓
Unmount → Close WebSocket → Delete listenKey ←──┘
```

## Reconnection Logic

```
Disconnect → Wait 1s → Retry 1
           → Wait 2s → Retry 2
           → Wait 4s → Retry 3
           → Wait 8s → Retry 4
           → Wait 16s → Retry 5
           → Give up (show error)
```

## Performance Metrics

| Metric | Value |
|--------|-------|
| **Update Latency** | < 100ms |
| **Reconnection Time** | < 5s |
| **Keep-alive Interval** | 30 minutes |
| **Max Retries** | 5 |
| **Fallback Polling** | 5 seconds |
| **API Calls** | 2/hour (keep-alive only) |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Not connecting | Check API keys, verify permissions |
| Frequent disconnects | Check network, verify keep-alive |
| Data not updating | Check console logs, verify events |
| High CPU usage | Add React.memo, memoize calculations |

## Browser Console Commands

```javascript
// Check WebSocket state
console.log('WS State:', window.wsRef?.current?.readyState);
// 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED

// Test listenKey
fetch('/api/listenkey?type=futures').then(r => r.json()).then(console.log);

// Test keep-alive
fetch('/api/listenkey?type=futures&listenKey=KEY', { method: 'PUT' })
  .then(r => r.json()).then(console.log);
```

## Testing Checklist

- [ ] WebSocket connects successfully
- [ ] Balance updates in real-time
- [ ] Positions update instantly
- [ ] Orders update correctly
- [ ] Reconnection works
- [ ] Keep-alive functions
- [ ] Fallback to SSE works
- [ ] Error handling works
- [ ] Cleanup on unmount
- [ ] Multiple tabs work

## Documentation Links

- [Implementation Details](./WEBSOCKET_IMPLEMENTATION.md)
- [Usage Guide](./WEBSOCKET_USAGE_GUIDE.md)
- [Testing Guide](./WEBSOCKET_TEST.md)
- [Summary](./WEBSOCKET_SUMMARY.md)
- [Binance API Docs](https://binance-docs.github.io/apidocs/futures/en/)

## Support

1. Check browser console for logs
2. Verify API key permissions
3. Test with Binance Testnet
4. Review error messages
5. Check Binance API status

---

**Quick Start:** Import hook → Use in component → Add ConnectionStatus → Done! 🚀
