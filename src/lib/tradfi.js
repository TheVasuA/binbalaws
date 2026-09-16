// TradFi reference lists — US stocks and commodities. Static names/symbols
// (no live prices yet; a stock/commodity data API can be wired in later).

// Major US stocks grouped by sector.
export const US_STOCKS = [
  { group: 'Technology', items: [
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'NVDA', name: 'NVIDIA' },
    { symbol: 'GOOGL', name: 'Alphabet (Google)' },
    { symbol: 'AMZN', name: 'Amazon' },
    { symbol: 'META', name: 'Meta Platforms' },
    { symbol: 'AVGO', name: 'Broadcom' },
    { symbol: 'ORCL', name: 'Oracle' },
    { symbol: 'CRM', name: 'Salesforce' },
    { symbol: 'AMD', name: 'Advanced Micro Devices' },
    { symbol: 'ADBE', name: 'Adobe' },
    { symbol: 'INTC', name: 'Intel' },
  ] },
  { group: 'Consumer / Auto', items: [
    { symbol: 'TSLA', name: 'Tesla' },
    { symbol: 'WMT', name: 'Walmart' },
    { symbol: 'COST', name: 'Costco' },
    { symbol: 'HD', name: 'Home Depot' },
    { symbol: 'NKE', name: 'Nike' },
    { symbol: 'MCD', name: "McDonald's" },
    { symbol: 'KO', name: 'Coca-Cola' },
    { symbol: 'PEP', name: 'PepsiCo' },
    { symbol: 'DIS', name: 'Walt Disney' },
  ] },
  { group: 'Finance', items: [
    { symbol: 'JPM', name: 'JPMorgan Chase' },
    { symbol: 'BAC', name: 'Bank of America' },
    { symbol: 'V', name: 'Visa' },
    { symbol: 'MA', name: 'Mastercard' },
    { symbol: 'BRK.B', name: 'Berkshire Hathaway' },
    { symbol: 'GS', name: 'Goldman Sachs' },
  ] },
  { group: 'Healthcare', items: [
    { symbol: 'UNH', name: 'UnitedHealth' },
    { symbol: 'JNJ', name: 'Johnson & Johnson' },
    { symbol: 'LLY', name: 'Eli Lilly' },
    { symbol: 'PFE', name: 'Pfizer' },
    { symbol: 'ABBV', name: 'AbbVie' },
  ] },
  { group: 'Energy / Industrial', items: [
    { symbol: 'XOM', name: 'Exxon Mobil' },
    { symbol: 'CVX', name: 'Chevron' },
    { symbol: 'CAT', name: 'Caterpillar' },
    { symbol: 'BA', name: 'Boeing' },
    { symbol: 'GE', name: 'GE Aerospace' },
  ] },
];

// Commodities — each shown separately. `binanceSymbol` is set only for items
// Binance actually lists (gold via PAX Gold / Tether Gold); the rest are
// reference-only because Binance has no crude/copper/zinc/US-stock markets.
export const COMMODITIES = [
  { symbol: 'GC', name: 'Gold (PAX Gold)', unit: 'USD / token', cat: 'Metals', binanceSymbol: 'PAXGUSDT' },
  { symbol: 'XAUT', name: 'Gold (Tether Gold)', unit: 'USD / token', cat: 'Metals', binanceSymbol: 'XAUTUSDT' },
  { symbol: 'CL', name: 'Crude Oil (WTI)', unit: 'USD / barrel', cat: 'Energy', binanceSymbol: null },
  { symbol: 'BZ', name: 'Brent Crude Oil', unit: 'USD / barrel', cat: 'Energy', binanceSymbol: null },
  { symbol: 'NG', name: 'Natural Gas', unit: 'USD / MMBtu', cat: 'Energy', binanceSymbol: null },
  { symbol: 'SI', name: 'Silver', unit: 'USD / troy oz', cat: 'Metals', binanceSymbol: null },
  { symbol: 'HG', name: 'Copper', unit: 'USD / lb', cat: 'Metals', binanceSymbol: null },
  { symbol: 'ZN', name: 'Zinc', unit: 'USD / tonne', cat: 'Metals', binanceSymbol: null },
];

// Friendly display names for Binance TradFi (TRADIFI_PERPETUAL) base assets.
// Keyed by baseAsset. Anything not listed falls back to its ticker symbol.
export const TRADIFI_NAMES = {
  // US mega-cap tech
  AAPL: 'Apple', MSFT: 'Microsoft', NVDA: 'NVIDIA', GOOGL: 'Alphabet (Google)',
  AMZN: 'Amazon', META: 'Meta Platforms', AVGO: 'Broadcom', ORCL: 'Oracle',
  CRM: 'Salesforce', AMD: 'AMD', ADBE: 'Adobe', INTC: 'Intel', QCOM: 'Qualcomm',
  MU: 'Micron', TXN: 'Texas Instruments', CSCO: 'Cisco', IBM: 'IBM', DELL: 'Dell',
  PLTR: 'Palantir', SMCI: 'Super Micro', ARM: 'Arm Holdings', ASML: 'ASML',
  TSM: 'TSMC', CRWD: 'CrowdStrike', PANW: 'Palo Alto Networks', SNOW: 'Snowflake',
  NET: 'Cloudflare', DDOG: 'Datadog', SHOP: 'Shopify', UBER: 'Uber',
  // Consumer / auto / other
  TSLA: 'Tesla', WMT: 'Walmart', COST: 'Costco', HD: 'Home Depot', KO: 'Coca-Cola',
  DIS: 'Walt Disney', CAT: 'Caterpillar', GME: 'GameStop', RIVN: 'Rivian',
  DKNG: 'DraftKings', RDDT: 'Reddit', HIMS: 'Hims & Hers', WEN: "Wendy's",
  EBAY: 'eBay', GPRO: 'GoPro', TTWO: 'Take-Two', ZM: 'Zoom', TEAM: 'Atlassian',
  // Finance / crypto-adjacent
  JPM: 'JPMorgan', GS: 'Goldman Sachs', V: 'Visa', PYPL: 'PayPal', SOFI: 'SoFi',
  COIN: 'Coinbase', MSTR: 'MicroStrategy', HOOD: 'Robinhood', CRCL: 'Circle',
  MARA: 'Marathon Digital', IREN: 'IREN', BMNR: 'Bitmine', NBIS: 'Nebius',
  // Healthcare / pharma
  LLY: 'Eli Lilly', MRK: 'Merck', MRNA: 'Moderna', NVO: 'Novo Nordisk',
  // AI labs (tokenized proxies)
  OPENAI: 'OpenAI', ANTHROPIC: 'Anthropic', ZHIPU: 'Zhipu AI', MINIMAX: 'MiniMax',
  UNITREE: 'Unitree', // robotics
  // China / Asia
  BABA: 'Alibaba', PDD: 'PDD Holdings', TENCENT: 'Tencent', MEITUAN: 'Meituan',
  BYD: 'BYD', SONY: 'Sony', SAMSUNG: 'Samsung', HYUNDAI: 'Hyundai',
  NAVER: 'Naver', KUAISHOU: 'Kuaishou', POPMART: 'Pop Mart',
  // ETFs / indices / leveraged
  SPY: 'S&P 500 ETF', QQQ: 'Nasdaq-100 ETF', IWM: 'Russell 2000 ETF',
  TQQQ: 'Nasdaq-100 3x', SQQQ: 'Nasdaq-100 -3x', SOXL: 'Semis 3x', SOXS: 'Semis -3x',
  SMH: 'Semiconductor ETF', GDX: 'Gold Miners ETF', XLE: 'Energy ETF',
  XBI: 'Biotech ETF', URNM: 'Uranium ETF', UVXY: 'Volatility ETF',
  TSLL: 'Tesla 2x', NVDL: 'NVIDIA 2x', MVLL: 'MicroStrategy 2x',
};

// Friendly names for Binance TradFi commodity base assets.
export const TRADIFI_COMMODITY_NAMES = {
  XAU: 'Gold', XAG: 'Silver', XPT: 'Platinum', XPD: 'Palladium',
  CL: 'Crude Oil (WTI)', NATGAS: 'Natural Gas', COPPER: 'Copper',
  GDX: 'Gold Miners ETF', XLE: 'Energy ETF', URNM: 'Uranium ETF', XBI: 'Biotech ETF',
};
