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
