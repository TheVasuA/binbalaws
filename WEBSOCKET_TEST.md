# WebSocket Connection Test Guide

This guide helps you test and verify the WebSocket implementation.

## Pre-requisites

1. **API Keys Configured**
   ```bash
   # .env or .env.local
   BINANCE_API_KEY=your_api_key
   BINANCE_API_SECRET=your_api_secret
   BINANCE_TESTNET=true  # Start with testnet
   ```

2. **Dependencies Installed**
   ```bash
   npm install
   ```

3. **Development Server Running**
   ```bash
   npm run dev
   ```

## Test Checklist

### ✅ 1. Basic Connection Test

**Navigate to:** `http://localhost:3000`

**Expected behavior:**
- Connection status shows 🟢 "Live" within 2-3 seconds
- No error messages in browser console
- Balance displays correctly

**Browser Console Logs:**
```
[Binance WS] Connected to User Data Stream
[Binance WS] Message received: ACCOUNT_UPDATE
```

**If fails:**
- Check API keys in `.env`
- Verify API key has "User Data Stream" permission
- Check browser console for errors

---

### ✅ 2. Real-time Balance Update Test

**Steps:**
1. Open dashboard in browser
2. Note current balance
3. Open Binance (testnet or live) in another tab
4. Place a small market order
5. Watch dashboard

**Expected behavior:**
- Balance updates within 1 second
- Position appears immediately
- No page refresh needed

**If fails:**
- Check WebSocket connection status
- Look for `ACCOUNT_UPDATE` events in console
- Verify order was executed on Binance

---

### ✅ 3. Position Update Test

**Steps:**
1. Open a position on Binance
2. Watch dashboard for position to appear
3. Close position on Binance
4. Watch dashboard for position to disappear

**Expected behavior:**
- Position appears instantly (< 1 second)
- Unrealized P&L updates in real-time
- Position removal is instant

**Browser Console:**
```
[Binance WS] Message received: ACCOUNT_UPDATE
[Binance WS] Message received: ORDER_TRADE_UPDATE
```

---

### ✅ 4. Order Update Test

**Steps:**
1. Place a limit order on Binance
2. Watch "Open Orders" section
3. Cancel the order
4. Verify it disappears

**Expected behavior:**
- Order appears immediately
- Order status updates in real-time
- Canceled orders removed instantly

---

### ✅ 5. Reconnection Test

**Steps:**
1. Open browser DevTools → Network tab
2. Filter by "WS" (WebSocket)
3. Right-click WebSocket connection → "Close connection"
4. Wait 5-10 seconds

**Expected behavior:**
- Status changes to 🟡 "Polling" or ⚪ "Disconnected"
- Automatic reconnection within 10 seconds
- Status returns to 🟢 "Live"

**Browser Console:**
```
[Binance WS] Connection closed
[Binance WS] Reconnecting in 2000ms (attempt 1/5)
[Binance WS] Connected to User Data Stream
```

---

### ✅ 6. Keep-Alive Test

**Steps:**
1. Keep dashboard open for 35+ minutes
2. Monitor browser console

**Expected behavior:**
- Every 30 minutes: `[Binance WS] ListenKey keep-alive sent`
- Connection stays alive
- No disconnections

**If fails:**
- Check keep-alive interval is running
- Verify `/api/listenkey` PUT endpoint works
- Check Binance API rate limits

---

### ✅ 7. Multiple Tab Test

**Steps:**
1. Open dashboard in Tab 1
2. Open dashboard in Tab 2
3. Place order in Tab 1
4. Watch both tabs

**Expected behavior:**
- Both tabs update simultaneously
- Each tab has its own WebSocket connection
- No conflicts or race conditions

---

### ✅ 8. Error Handling Test

**Steps:**
1. Stop development server
2. Watch dashboard
3. Restart server

**Expected behavior:**
- Error message appears
- Status shows 🔴 "Error"
- Automatic reconnection after server restart

---

### ✅ 9. Fallback Mode Test

**Steps:**
1. Block WebSocket connections (browser extension or firewall)
2. Refresh dashboard

**Expected behavior:**
- Falls back to SSE polling
- Status shows 🟡 "Polling"
- Updates every 5 seconds
- No crashes or errors

---

### ✅ 10. Performance Test

**Steps:**
1. Open browser DevTools → Performance tab
2. Start recording
3. Place multiple orders rapidly
4. Stop recording

**Expected behavior:**
- No memory leaks
- Smooth UI updates
- CPU usage < 10%
- No frame drops

---

## Manual Testing Script

### Test 1: Connection Flow

```javascript
// Open browser console and run:

// 1. Check WebSocket connection
console.log('WebSocket:', window.wsRef?.current?.readyState);
// Expected: 1 (OPEN)

// 2. Check listenKey
fetch('/api/listenkey?type=futures')
  .then(r => r.json())
  .then(d => console.log('ListenKey:', d));
// Expected: { success: true, listenKey: "..." }

// 3. Test keep-alive
fetch('/api/listenkey?type=futures&listenKey=YOUR_KEY', { method: 'PUT' })
  .then(r => r.json())
  .then(d => console.log('Keep-alive:', d));
// Expected: { success: true }
```

### Test 2: Message Handling

```javascript
// Monitor WebSocket messages
const ws = new WebSocket('wss://fstream.binance.com/ws/YOUR_LISTEN_KEY');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log('Event:', msg.e);
  console.log('Data:', msg);
};

ws.onopen = () => console.log('Connected');
ws.onerror = (err) => console.error('Error:', err);
ws.onclose = () => console.log('Closed');
```

### Test 3: State Updates

```javascript
// In your component, add debug logging:

useEffect(() => {
  console.log('Account updated:', account);
}, [account]);

useEffect(() => {
  console.log('Positions updated:', positions);
}, [positions]);

useEffect(() => {
  console.log('Orders updated:', openOrders);
}, [openOrders]);
```

---

## Automated Testing (Future)

### Unit Tests

```javascript
// __tests__/binanceWS.test.js
import { renderHook } from '@testing-library/react';
import { useBinanceFuturesStream } from '@/lib/binanceWS';

test('connects to WebSocket', async () => {
  const { result } = renderHook(() => useBinanceFuturesStream());
  
  await waitFor(() => {
    expect(result.current.wsConnected).toBe(true);
  });
});

test('handles account updates', async () => {
  const { result } = renderHook(() => useBinanceFuturesStream());
  
  // Simulate WebSocket message
  act(() => {
    mockWebSocket.emit('message', {
      e: 'ACCOUNT_UPDATE',
      a: { B: [{ a: 'USDT', wb: '10000' }] }
    });
  });
  
  expect(result.current.account.totalWalletBalance).toBe(10000);
});
```

### Integration Tests

```javascript
// __tests__/integration/websocket.test.js
import { render, screen } from '@testing-library/react';
import Dashboard from '@/app/(dashboard)/page';

test('displays live balance', async () => {
  render(<Dashboard />);
  
  await waitFor(() => {
    expect(screen.getByText(/Live/i)).toBeInTheDocument();
  });
  
  expect(screen.getByText(/\$\d+\.\d{2}/)).toBeInTheDocument();
});
```

---

## Common Issues & Solutions

### Issue: WebSocket Not Connecting

**Symptoms:**
- Status stuck on ⚪ "Disconnected"
- Console error: "Failed to get listenKey"

**Solutions:**
1. Check API keys in `.env`
2. Verify API key permissions
3. Check Binance API status
4. Try testnet first

---

### Issue: Frequent Disconnections

**Symptoms:**
- Connection drops every few minutes
- Constant reconnection attempts

**Solutions:**
1. Check network stability
2. Verify keep-alive is working
3. Check Binance rate limits
4. Review API key restrictions

---

### Issue: Data Not Updating

**Symptoms:**
- WebSocket connected but no updates
- Balance/positions frozen

**Solutions:**
1. Check browser console for errors
2. Verify WebSocket messages arriving
3. Check state update logic
4. Test with manual order placement

---

### Issue: High CPU Usage

**Symptoms:**
- Browser tab consuming high CPU
- UI feels sluggish

**Solutions:**
1. Check for infinite re-renders
2. Add React.memo to components
3. Memoize expensive calculations
4. Debounce rapid updates

---

## Production Checklist

Before deploying to production:

- [ ] Tested with real API keys (not testnet)
- [ ] Verified all WebSocket events handled
- [ ] Tested reconnection logic
- [ ] Tested keep-alive mechanism
- [ ] Verified error handling
- [ ] Tested with slow network
- [ ] Tested with multiple tabs
- [ ] Checked for memory leaks
- [ ] Verified cleanup on unmount
- [ ] Tested fallback to SSE
- [ ] Added monitoring/logging
- [ ] Documented known issues

---

## Monitoring in Production

### Key Metrics to Track

1. **Connection Success Rate**
   - % of successful WebSocket connections
   - Target: > 99%

2. **Reconnection Time**
   - Average time to reconnect
   - Target: < 5 seconds

3. **Message Latency**
   - Time from Binance event to UI update
   - Target: < 500ms

4. **Error Rate**
   - WebSocket errors per hour
   - Target: < 1%

5. **Keep-Alive Success**
   - % of successful keep-alive pings
   - Target: > 99%

### Logging

```javascript
// Add to production:
const logWebSocketEvent = (event, data) => {
  // Send to your logging service
  analytics.track('websocket_event', {
    event,
    timestamp: Date.now(),
    data
  });
};

ws.onopen = () => {
  logWebSocketEvent('connected', { url: ws.url });
};

ws.onerror = (error) => {
  logWebSocketEvent('error', { error: error.message });
};
```

---

## Next Steps

1. Complete all tests in this checklist
2. Fix any issues found
3. Test with testnet thoroughly
4. Deploy to staging
5. Monitor for 24 hours
6. Deploy to production
7. Set up monitoring alerts

## Support

For issues during testing:
1. Check browser console logs
2. Review [WEBSOCKET_IMPLEMENTATION.md](./WEBSOCKET_IMPLEMENTATION.md)
3. Test with Binance Testnet
4. Verify API key permissions
5. Check Binance API status page
