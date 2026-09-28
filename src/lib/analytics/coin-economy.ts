import "server-only";

import { prisma } from "@/lib/prisma";

export type CoinEconomyAnalytics = {
  totalPremiumUsers: number;
  totalCoinsEarned: number;
  totalCoinsSpent: number;
  premiumRedemptions: number;
  coinsInCirculation: number;
};

/**
 * Phase 26 — Analytics: real, platform-wide coin economy numbers (root
 * view). "Coin Economy Health" = coins currently in circulation (earned
 * minus spent) — real balances summed, not a guessed ratio.
 */
export async function getCoinEconomyAnalytics(): Promise<CoinEconomyAnalytics> {
  const [activeSubscribers, earnedAgg, spentAgg, premiumRedemptions, circulationAgg] = await Promise.all([
    // distinct studentId, not a raw row count — a student's Subscription row
    // is updated in place, never duplicated, but this stays correct even if
    // a rare self-heal gap ever produced a second row.
    prisma.subscription.findMany({ where: { status: "ACTIVE" }, select: { studentId: true }, distinct: ["studentId"] }),
    prisma.coinTransaction.aggregate({ where: { amount: { gt: 0 } }, _sum: { amount: true } }),
    prisma.coinTransaction.aggregate({ where: { amount: { lt: 0 } }, _sum: { amount: true } }),
    prisma.coinTransaction.count({ where: { type: "REDEMPTION" } }),
    prisma.coinWallet.aggregate({ _sum: { balance: true } }),
  ]);

  return {
    totalPremiumUsers: activeSubscribers.length,
    totalCoinsEarned: earnedAgg._sum.amount ?? 0,
    totalCoinsSpent: Math.abs(spentAgg._sum.amount ?? 0),
    premiumRedemptions,
    coinsInCirculation: circulationAgg._sum.balance ?? 0,
  };
}

export type CoinLeaderRow = { studentId: string; name: string | null; email: string; amount: number };

/** Phase 29 — Part 7. Real sums of positive/negative CoinTransaction amounts grouped by student — not derived from wallet balance (which nets earn/spend together). */
export async function getTopCoinEarners(limit = 10): Promise<CoinLeaderRow[]> {
  const grouped = await prisma.coinTransaction.groupBy({
    by: ["studentId"],
    where: { amount: { gt: 0 } },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: limit,
  });

  const students = await prisma.studentProfile.findMany({
    where: { id: { in: grouped.map((g) => g.studentId) } },
    select: { id: true, user: { select: { name: true, email: true } } },
  });
  const byId = new Map(students.map((s) => [s.id, s.user]));

  return grouped
    .map((g) => ({ studentId: g.studentId, name: byId.get(g.studentId)?.name ?? null, email: byId.get(g.studentId)?.email ?? "", amount: g._sum.amount ?? 0 }))
    .filter((row) => row.email !== "");
}

export async function getTopCoinSpenders(limit = 10): Promise<CoinLeaderRow[]> {
  const grouped = await prisma.coinTransaction.groupBy({
    by: ["studentId"],
    where: { amount: { lt: 0 } },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "asc" } },
    take: limit,
  });

  const students = await prisma.studentProfile.findMany({
    where: { id: { in: grouped.map((g) => g.studentId) } },
    select: { id: true, user: { select: { name: true, email: true } } },
  });
  const byId = new Map(students.map((s) => [s.id, s.user]));

  return grouped
    .map((g) => ({ studentId: g.studentId, name: byId.get(g.studentId)?.name ?? null, email: byId.get(g.studentId)?.email ?? "", amount: Math.abs(g._sum.amount ?? 0) }))
    .filter((row) => row.email !== "");
}

export type CoinInflationPoint = { weekLabel: string; earned: number; spent: number; net: number };

/**
 * Phase 29 — "Coin inflation monitoring": real weekly earned vs. spent
 * totals for the last 8 weeks. A sustained positive `net` means more coins
 * are being created than removed from the economy (inflation) — not a
 * guessed ratio, a direct real sum per week.
 */
export async function getCoinInflationTrend(weeks = 8): Promise<CoinInflationPoint[]> {
  const start = new Date();
  start.setDate(start.getDate() - weeks * 7);
  start.setHours(0, 0, 0, 0);

  const transactions = await prisma.coinTransaction.findMany({
    where: { createdAt: { gte: start } },
    select: { amount: true, createdAt: true },
  });

  function weekLabel(date: Date): string {
    const d = new Date(date);
    const diffToMonday = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - diffToMonday);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }

  const byWeek = new Map<string, { earned: number; spent: number }>();
  for (const tx of transactions) {
    const label = weekLabel(tx.createdAt);
    const bucket = byWeek.get(label) ?? { earned: 0, spent: 0 };
    if (tx.amount > 0) bucket.earned += tx.amount;
    else bucket.spent += Math.abs(tx.amount);
    byWeek.set(label, bucket);
  }

  return [...byWeek.entries()]
    .map(([weekLabel, { earned, spent }]) => ({ weekLabel, earned, spent, net: earned - spent }))
    .sort((a, b) => a.weekLabel.localeCompare(b.weekLabel))
    .slice(-weeks);
}
