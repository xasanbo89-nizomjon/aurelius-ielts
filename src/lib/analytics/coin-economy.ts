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
