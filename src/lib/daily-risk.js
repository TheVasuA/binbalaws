// Today's risk position derived from the account, today's realized PnL and
// the configured limits. The circuit breaker trips on realized loss only (the
// server enforces the same rule), while the bars show the live net figure.

export function computeDailyRisk({ account, dailyPnl, settings }) {
  const wallet = Number(account?.totalWalletBalance) || 0;
  const unrealized = Number(account?.totalUnrealizedProfit) || 0;
  const realized = Number(dailyPnl?.realizedPnl) || 0;
  const net = realized + unrealized;

  const limitPercent = Number(settings?.dailyLossLimitPercent) || 0;
  const alarmPercent = Number(settings?.alarmLossPercent) || 0;
  const targetPercent = Number(settings?.compoundPercent) || 0;

  const limitUsd = wallet * (limitPercent / 100);
  const alarmUsd = wallet * (alarmPercent / 100);
  const targetUsd = wallet * (targetPercent / 100);

  const realizedLoss = Math.max(0, -realized);
  const liveLoss = Math.max(0, -net);
  const liveProfit = Math.max(0, net);

  const breakerTripped = limitUsd > 0 && realizedLoss >= limitUsd;
  const alarmTripped = alarmUsd > 0 && realizedLoss >= alarmUsd;

  return {
    wallet,
    unrealized,
    realized,
    net,
    limitPercent,
    limitUsd,
    alarmPercent,
    alarmUsd,
    targetPercent,
    targetUsd,
    realizedLoss,
    liveLoss,
    liveProfit,
    lossUsedPct: limitUsd > 0 ? Math.min(100, (liveLoss / limitUsd) * 100) : 0,
    targetPct: targetUsd > 0 ? Math.min(100, (liveProfit / targetUsd) * 100) : 0,
    targetHit: targetUsd > 0 && liveProfit >= targetUsd,
    realizedLossPctOfWallet: wallet > 0 ? (realizedLoss / wallet) * 100 : 0,
    breakerTripped,
    breakerNear: !breakerTripped && limitUsd > 0 && realizedLoss >= limitUsd * 0.7,
    alarmTripped,
  };
}
