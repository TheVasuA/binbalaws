// Calculate risk metrics
export function calculateRiskMetrics(holdings, totalValue) {
  if (!holdings || holdings.length === 0) {
    return {
      diversificationScore: 0,
      largestPosition: 0,
      volatilityExposure: 'N/A',
      stablecoinRatio: 0,
      riskLevel: 'N/A',
    };
  }

  // Largest position concentration
  const largestPosition = holdings[0]?.allocation || 0;
  
  // Stablecoin ratio
  const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'FDUSD'];
  const stablecoinValue = holdings
    .filter(h => stablecoins.includes(h.currency))
    .reduce((sum, h) => sum + h.valueUSD, 0);
  const stablecoinRatio = totalValue > 0 ? (stablecoinValue / totalValue) * 100 : 0;
  
  // Diversification score (based on number of assets and distribution)
  const n = holdings.length;
  const hhi = holdings.reduce((sum, h) => sum + Math.pow(h.allocation / 100, 2), 0);
  const diversificationScore = n > 1 
    ? Math.min(100, ((1 - hhi) / (1 - 1/n)) * 100)
    : 0;
  
  // Volatility exposure (simplified based on asset types)
  const highVolatility = ['BTC', 'ETH', 'SOL', 'DOGE', 'SHIB', 'PEPE', 'FLOKI', 'BONK'];
  const highVolExposure = holdings
    .filter(h => highVolatility.includes(h.currency))
    .reduce((sum, h) => sum + h.allocation, 0);
  
  let volatilityExposure;
  if (highVolExposure > 70) volatilityExposure = 'High';
  else if (highVolExposure > 40) volatilityExposure = 'Medium';
  else volatilityExposure = 'Low';
  
  // Overall risk level
  let riskLevel;
  if (stablecoinRatio > 50) riskLevel = 'Conservative';
  else if (stablecoinRatio > 20 && largestPosition < 50) riskLevel = 'Moderate';
  else if (largestPosition > 70 || stablecoinRatio < 10) riskLevel = 'Aggressive';
  else riskLevel = 'Moderate';
  
  return {
    diversificationScore: diversificationScore.toFixed(1),
    largestPosition: largestPosition.toFixed(1),
    volatilityExposure,
    stablecoinRatio: stablecoinRatio.toFixed(1),
    riskLevel,
  };
}

// Calculate futures risk metrics (pure function - safe for client components)
export function calculateFuturesRiskMetrics(positions, account) {
  if (!positions || positions.length === 0) {
    return {
      totalPnL: 0,
      totalPnLPercent: 0,
      maxLeverage: 0,
      avgLeverage: 0,
      marginUsage: 0,
      positionCount: 0,
      longExposure: 0,
      shortExposure: 0,
      totalNotional: 0,
      riskLevel: 'N/A',
    };
  }

  const totalPnL = positions.reduce((sum, p) => sum + (p.unrealizedProfit || 0), 0);
  const totalNotional = positions.reduce((sum, p) => sum + (p.notionalValue || 0), 0);
  const longExposure = positions
    .filter(p => p.side === 'LONG')
    .reduce((sum, p) => sum + (p.notionalValue || 0), 0);
  const shortExposure = positions
    .filter(p => p.side === 'SHORT')
    .reduce((sum, p) => sum + (p.notionalValue || 0), 0);
  const maxLeverage = Math.max(...positions.map(p => p.leverage || 1));
  const avgLeverage =
    positions.reduce((sum, p) => sum + (p.leverage || 1), 0) / positions.length;

  const marginBalance = account?.totalMarginBalance || account?.totalWalletBalance || 1;
  const positionInitialMargin = account?.totalPositionInitialMargin || 0;
  const walletBalance = account?.totalWalletBalance || 1;

  const marginUsage = (positionInitialMargin / marginBalance) * 100;
  const totalPnLPercent = (totalPnL / walletBalance) * 100;

  let riskLevel;
  if (maxLeverage >= 20 || marginUsage > 80) riskLevel = 'Very High';
  else if (maxLeverage >= 10 || marginUsage > 50) riskLevel = 'High';
  else if (maxLeverage >= 5 || marginUsage > 30) riskLevel = 'Medium';
  else riskLevel = 'Low';

  return {
    totalPnL: totalPnL.toFixed(2),
    totalPnLPercent: totalPnLPercent.toFixed(2),
    maxLeverage,
    avgLeverage: avgLeverage.toFixed(1),
    marginUsage: marginUsage.toFixed(1),
    positionCount: positions.length,
    longExposure: longExposure.toFixed(2),
    shortExposure: shortExposure.toFixed(2),
    totalNotional: totalNotional.toFixed(2),
    riskLevel,
  };
}
