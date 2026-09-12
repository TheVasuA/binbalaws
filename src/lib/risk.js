// Calculate risk metrics
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
