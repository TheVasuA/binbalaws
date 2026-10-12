// Compound goal ladder: each milestone grows the balance by `percent` until the
// target is reached. Shared by the Goal page, the sidebar summary and admin.

const MAX_MILESTONES = 1000;

export function buildMilestones(startBalance, target, percent) {
  const milestones = [];
  const start = Number(startBalance);
  const rate = Number(percent) / 100;
  if (!(start > 0) || !(rate > 0) || !(target > start)) return milestones;

  let balance = start;
  while (balance < target && milestones.length < MAX_MILESTONES) {
    const profit = balance * rate;
    milestones.push({
      trade: milestones.length + 1,
      startBalance: balance,
      profit,
      endBalance: balance + profit,
    });
    balance += profit;
  }
  return milestones;
}

export function goalSummary({ startBalance, target, percent, completed }) {
  const milestones = buildMilestones(startBalance, target, percent);
  const total = milestones.length;
  const done = Math.min(Number(completed) || 0, total);
  return {
    milestones,
    total,
    completed: done,
    remaining: total - done,
    progress: total > 0 ? (done / total) * 100 : 0,
    current: milestones[done] || null,
  };
}
