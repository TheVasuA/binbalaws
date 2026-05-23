# Binance Portfolio Risk Dashboard

A real-time portfolio risk management dashboard for Binance, built with Next.js and designed for Vercel deployment.

## Features

- **Real-Time Updates**: Live WebSocket connection for instant balance and position updates (< 100ms latency)
- **Futures Trading Dashboard**: 
  - Live position tracking with real-time P&L
  - Open positions with entry price, mark price, and liquidation levels
  - Risk metrics including leverage, margin usage, and exposure
  - Stop-loss and take-profit tracking
- **Spot Portfolio Overview**: View total portfolio value and asset holdings
- **Connection Status**: Visual indicator showing WebSocket (Live), SSE (Polling), or Disconnected status
- **Risk Analysis**: 
  - Diversification score
  - Largest position concentration
  - Stablecoin ratio
  - Volatility exposure assessment
  - Overall risk level classification
- **Holdings Table**: Detailed view of all assets with prices, 24h changes, and allocation percentages
- **Allocation Chart**: Visual pie chart of portfolio distribution
- **Open Orders**: View pending limit orders with real-time updates
- **Automatic Reconnection**: Exponential backoff retry logic with fallback to polling
- **Demo Mode**: Works without API keys using sample data

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Binance account with API access (optional for demo mode)

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd bindash
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env.local
```

4. Add your Binance API keys to `.env.local`:
```env
BINANCE_API_KEY=your_api_key_here
BINANCE_API_SECRET=your_api_secret_here
BINANCE_TESTNET=false
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Key Setup

1. Go to [Binance API Management](https://www.binance.com/en/my/settings/api-management)
2. Create a new API key
3. **Important Security Settings**:
   - Enable "Enable Reading" permission (required for portfolio data)
   - Enable "Enable Futures" permission (required for futures trading data)
   - Enable "Enable Spot & Margin Trading" permission (optional, for spot data)
   - **Do NOT enable** "Enable Withdrawals" (not needed for this dashboard)
   - Restrict IP access to your server's IP address for production
   - Never share your API secret

**Note:** The dashboard uses Binance User Data Streams for real-time updates, which requires API keys with appropriate permissions.

## Vercel Deployment

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/bindash)

### Manual Deployment

1. Push your code to GitHub

2. Import project in Vercel:
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your GitHub repository

3. Add Environment Variables in Vercel:
   - Go to Project Settings → Environment Variables
   - Add the following:
     - `BINANCE_API_KEY`: Your Binance API key
     - `BINANCE_API_SECRET`: Your Binance API secret
     - `BINANCE_TESTNET`: `false` (or `true` for testnet)

4. Deploy!

## Project Structure

```
bindash/
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── page.js              # Futures dashboard
│   │   │   ├── spot/page.js         # Spot portfolio
│   │   │   ├── trades/page.js       # Trade history
│   │   │   └── layout.js            # Dashboard layout
│   │   ├── api/
│   │   │   ├── futures/
│   │   │   │   ├── route.js         # Futures data endpoint
│   │   │   │   └── stream/route.js  # SSE stream (fallback)
│   │   │   ├── listenkey/route.js   # WebSocket listenKey management
│   │   │   ├── portfolio/route.js   # Portfolio data endpoint
│   │   │   ├── prices/route.js      # Price data endpoint
│   │   │   └── orders/route.js      # Orders endpoint
│   │   ├── layout.js
│   │   └── globals.css
│   ├── components/
│   │   ├── AllocationChart.js       # Portfolio pie chart
│   │   ├── ConnectionStatus.js      # WebSocket status indicator
│   │   ├── FuturesPositions.js      # Futures positions table
│   │   ├── FuturesRiskMetrics.js    # Futures risk analysis
│   │   ├── HoldingsTable.js         # Holdings data table
│   │   ├── LoadingSpinner.js        # Loading component
│   │   ├── OpenOrders.js            # Open orders table
│   │   ├── PortfolioHeader.js       # Header with total value
│   │   └── RiskMetrics.js           # Risk analysis cards
│   └── lib/
│       ├── binance.js               # Binance REST API integration
│       ├── binanceWS.js             # WebSocket hooks (NEW!)
│       ├── risk.js                  # Risk calculation utilities
│       └── utils.js                 # Utility functions
├── WEBSOCKET_IMPLEMENTATION.md      # Technical WebSocket docs
├── WEBSOCKET_USAGE_GUIDE.md         # Developer usage guide
├── WEBSOCKET_TEST.md                # Testing procedures
├── WEBSOCKET_QUICK_REFERENCE.md     # Quick reference card
├── vercel.json                      # Vercel configuration
├── .env.example                     # Environment template
└── README.md
```

## Risk Metrics Explained

| Metric | Description |
|--------|-------------|
| **Risk Level** | Overall assessment: Conservative, Moderate, or Aggressive |
| **Diversification Score** | 0-100 scale based on asset distribution (higher = better) |
| **Largest Position** | Percentage of portfolio in the top holding |
| **Stablecoin Ratio** | Percentage held in stablecoins (USDT, USDC, etc.) |
| **Volatility Exposure** | High/Medium/Low based on volatile asset holdings |

## Security Considerations

- API keys are stored as environment variables, never in code
- Read-only API permissions are sufficient for this dashboard
- No trading functionality - view only
- Environment files are gitignored by default

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 4
- **Charts**: Recharts
- **API Integration**: Axios + Native WebSocket
- **Real-time Updates**: Binance User Data Streams (WebSocket)
- **Fallback**: Server-Sent Events (SSE) with 5-second polling
- **Deployment**: Vercel

## WebSocket Features

This dashboard uses **Binance User Data Streams** for real-time updates:

- **< 100ms latency** for balance and position changes
- **Automatic reconnection** with exponential backoff
- **Fallback to polling** if WebSocket fails
- **Keep-alive mechanism** (30-minute intervals)
- **Connection status indicator** (Live/Polling/Disconnected)

### Connection States

| Status | Icon | Meaning | Latency |
|--------|------|---------|---------|
| **Live** | 🟢 | WebSocket connected | < 100ms |
| **Polling** | 🟡 | SSE fallback | ~5 seconds |
| **Disconnected** | ⚪ | Connecting | N/A |
| **Error** | 🔴 | Connection failed | N/A |

### Performance Improvements

| Metric | Before (Polling) | After (WebSocket) | Improvement |
|--------|------------------|-------------------|-------------|
| Update Latency | 5 seconds | < 100ms | **50x faster** |
| API Calls | 12/minute | 2/hour | **360x fewer** |
| Data Transfer | Full snapshots | Deltas only | **~80% less** |

For detailed WebSocket documentation, see:
- [WEBSOCKET_IMPLEMENTATION.md](./WEBSOCKET_IMPLEMENTATION.md) - Technical details
- [WEBSOCKET_USAGE_GUIDE.md](./WEBSOCKET_USAGE_GUIDE.md) - Usage examples
- [WEBSOCKET_TEST.md](./WEBSOCKET_TEST.md) - Testing guide
- [WEBSOCKET_QUICK_REFERENCE.md](./WEBSOCKET_QUICK_REFERENCE.md) - Quick reference

## License

MIT License - feel free to use and modify for your own projects.
