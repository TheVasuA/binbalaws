# WebSocket Usage Guide

Quick guide to using the live balance WebSocket connection in your application.

## Quick Start

### 1. Import the Hook

```javascript
import { useBinanceFuturesStream } from '@/lib/binanceWS';
// or
import { useBinanceSpotStream } from '@/lib/binanceWS';
```

### 2. Use in Your Component

```javascript
export default function MyDashboard() {
  const { 
    account,           // Current account data
    positions,         // Open positions
    openOrders,        // Open orders
    connected,         // SSE connection status
    wsConnected,       // WebSocket connection status
    error              // Error message if any
  } = useBinanceFuturesStream();

  return (
    <div>
      <h1>Balance: ${account?.currentBalance}</h1>
      <p>Status: {wsConnected ? 'Live' : 'Polling'}</p>
    </div>
  );
}
```

### 3. Add Connection Status Indicator

```javascript
import ConnectionStatus from '@/components/ConnectionStatus';

<ConnectionStatus 
  wsConnected={wsConnected} 
  connected={connected} 
  error={error} 
/>
```

## Complete Example

```javascript
'use client';

import { useBinanceFuturesStream } from '@/lib/binanceWS';
import ConnectionStatus from '@/components/ConnectionStatus';

export default function TradingDashboard() {
  const { 
    account, 
    positions, 
    openOrders,
    connected,
    wsConnected,
    error 
  } = useBinanceFuturesStream();

  return (
    <div className="p-6">
      {/* Header with connection status */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Trading Dashboard</h1>
        <ConnectionStatus 
          wsConnected={wsConnected} 
          connected={connected} 
          error={error} 
        />
      </div>

      {/* Account Balance */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <h2 className="text-gray-400 text-sm mb-2">Current Balance</h2>
        <p className="text-3xl font-bold">
          ${account?.currentBalance?.toFixed(2) || '0.00'}
        </p>
        {account?.totalUnrealizedProfit !== undefined && (
          <p className={`text-sm mt-2 ${
            account.totalUnrealizedProfit >= 0 
              ? 'text-green-400' 
              : 'text-red-400'
          }`}>
            {account.totalUnrealizedProfit >= 0 ? '+' : ''}
            ${account.totalUnrealizedProfit.toFixed(2)} unrealized
          </p>
        )}
      </div>

      {/* Positions */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <h2 className="text-xl font-semibold mb-4">Open Positions</h2>
        {positions.length === 0 ? (
          <p className="text-gray-400">No open positions</p>
        ) : (
          <div className="space-y-3">
            {positions.map(position => (
              <div 
                key={position.symbol} 
                className="bg-gray-700 rounded p-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{position.symbol}</h3>
                    <p className="text-sm text-gray-400">
                      {position.side} {position.positionAmt} @ ${position.entryPrice}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${
                      position.unrealizedProfit >= 0 
                        ? 'text-green-400' 
                        : 'text-red-400'
                    }`}>
                      {position.unrealizedProfit >= 0 ? '+' : ''}
                      ${position.unrealizedProfit.toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-400">
                      Mark: ${position.markPrice}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Open Orders */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-4">Open Orders</h2>
        {openOrders.length === 0 ? (
          <p className="text-gray-400">No open orders</p>
        ) : (
          <div className="space-y-2">
            {openOrders.map(order => (
              <div 
                key={order.id} 
                className="bg-gray-700 rounded p-3 flex justify-between"
              >
                <div>
                  <p className="font-semibold">{order.symbol}</p>
                  <p className="text-sm text-gray-400">
                    {order.type} {order.side}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">${order.price}</p>
                  <p className="text-sm text-gray-400">
                    {order.quantity} qty
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-900 border border-red-500 rounded-lg p-4 max-w-sm">
          <h4 className="font-semibold text-red-400 mb-2">Connection Error</h4>
          <p className="text-sm text-gray-300">{error}</p>
        </div>
      )}
    </div>
  );
}
```

## Spot Trading Example

```javascript
'use client';

import { useBinanceSpotStream } from '@/lib/binanceWS';
import ConnectionStatus from '@/components/ConnectionStatus';

export default function SpotPortfolio() {
  const { 
    holdings, 
    totalValue,
    connected,
    wsConnected,
    error 
  } = useBinanceSpotStream();

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Spot Portfolio</h1>
        <ConnectionStatus 
          wsConnected={wsConnected} 
          connected={connected} 
          error={error} 
        />
      </div>

      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <h2 className="text-gray-400 text-sm mb-2">Total Value</h2>
        <p className="text-3xl font-bold">
          ${totalValue.toFixed(2)}
        </p>
      </div>

      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-4">Holdings</h2>
        <div className="space-y-2">
          {holdings.map(holding => (
            <div 
              key={holding.currency} 
              className="bg-gray-700 rounded p-3 flex justify-between"
            >
              <div>
                <p className="font-semibold">{holding.currency}</p>
                <p className="text-sm text-gray-400">
                  {holding.amount.toFixed(8)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">
                  ${holding.valueUSD.toFixed(2)}
                </p>
                <p className={`text-sm ${
                  holding.change24h >= 0 
                    ? 'text-green-400' 
                    : 'text-red-400'
                }`}>
                  {holding.change24h >= 0 ? '+' : ''}
                  {holding.change24h.toFixed(2)}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

## With Server-Side Initial Data

For better performance, fetch initial data server-side:

```javascript
// app/dashboard/page.js
import { getFuturesAccount, getFuturesPositions } from '@/lib/binance';

export default async function DashboardPage() {
  // Fetch initial data server-side
  const [account, positions] = await Promise.all([
    getFuturesAccount(),
    getFuturesPositions(),
  ]);

  return (
    <DashboardClient 
      initialData={{ account, positions }} 
    />
  );
}

// components/DashboardClient.js
'use client';

import { useBinanceFuturesStream } from '@/lib/binanceWS';

export default function DashboardClient({ initialData }) {
  const { 
    account, 
    positions,
    wsConnected 
  } = useBinanceFuturesStream({ initialData });

  // Component renders immediately with initialData
  // Then switches to live WebSocket updates
  return (
    <div>
      <h1>Balance: ${account?.currentBalance}</h1>
      {/* ... */}
    </div>
  );
}
```

## Connection Status Meanings

| Status | Icon | Meaning |
|--------|------|---------|
| **Live** | 🟢 | WebSocket connected - real-time updates |
| **Polling** | 🟡 | Fallback mode - 5 second updates |
| **Disconnected** | ⚪ | Connecting or reconnecting |
| **Error** | 🔴 | Connection failed |

## Best Practices

### 1. Always Handle Loading States

```javascript
const { account, positions } = useBinanceFuturesStream();

if (!account) {
  return <LoadingSpinner />;
}

return <Dashboard account={account} />;
```

### 2. Display Connection Status

```javascript
<ConnectionStatus 
  wsConnected={wsConnected} 
  connected={connected} 
  error={error} 
/>
```

### 3. Handle Errors Gracefully

```javascript
{error && (
  <div className="error-banner">
    <p>{error}</p>
    <button onClick={refetch}>Retry</button>
  </div>
)}
```

### 4. Use Initial Data for SSR

```javascript
// Server Component
const initialData = await fetchInitialData();

// Client Component
<ClientDashboard initialData={initialData} />
```

### 5. Memoize Calculations

```javascript
const totalPnL = useMemo(() => {
  return positions.reduce((sum, pos) => 
    sum + pos.unrealizedProfit, 0
  );
}, [positions]);
```

## Troubleshooting

### WebSocket Not Connecting

**Check environment variables:**
```bash
BINANCE_API_KEY=your_key
BINANCE_API_SECRET=your_secret
```

**Check browser console:**
```javascript
// Look for these logs:
[Binance WS] Connected to User Data Stream
[Binance WS] Message received: ACCOUNT_UPDATE
```

### Data Not Updating

**Verify connection status:**
```javascript
console.log('WS Connected:', wsConnected);
console.log('SSE Connected:', connected);
```

**Check for errors:**
```javascript
console.log('Error:', error);
```

### Frequent Disconnections

**Check keep-alive logs:**
```javascript
[Binance WS] ListenKey keep-alive sent
```

**Verify API permissions:**
- User Data Stream permission required
- Check Binance API key settings

## Performance Tips

1. **Use initial data** to avoid loading states
2. **Memoize calculations** to prevent unnecessary re-renders
3. **Debounce updates** if rendering is expensive
4. **Use React.memo** for child components

```javascript
const PositionCard = React.memo(({ position }) => {
  return <div>{position.symbol}</div>;
});
```

## Next Steps

- Read [WEBSOCKET_IMPLEMENTATION.md](./WEBSOCKET_IMPLEMENTATION.md) for technical details
- Check [Binance API Documentation](https://binance-docs.github.io/apidocs/futures/en/)
- Test with Binance Testnet first
- Monitor WebSocket logs in production

## Support

If you encounter issues:
1. Check browser console for WebSocket logs
2. Verify API key permissions
3. Test with testnet first
4. Review error messages carefully
