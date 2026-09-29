import "server-only";

import { prisma } from "@/lib/prisma";

function monthLabel(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export type PremiumMonthlyPoint = { monthLabel: string; activations: number };

export type PremiumAnalytics = {
  activePremiumUsers: number;
  expiredPremiumUsers: number;
  coinBasedActivations: number;
  directActivations: number;
  adminGrantedActivations: number;
  /** Phase 30 — approved via the Telegram manual-purchase flow. */
  telegramActivations: number;
  monthlyActivations: PremiumMonthlyPoint[];
  /** Phase 43 — every distinct student who has EVER had a real paid/granted premium source (active, expired, or cancelled) — never counts an organic free trial. */
  totalPremiumAccounts: number;
  /** Phase 43 — real renewals: PREMIUM_GRANT audit events beyond a student's first (their first grant is an activation, not a renewal). Coin/Telegram/Direct re-activations of an already-real premium source count the same way via the same audit trail. */
  renewals: number;
};

/**
 * Phase 29 — Part 8, Premium Analytics (root-only). Real counts by real
 * Subscription.status and Subscription.source (Phase 26) — "Premium
 * Growth" and "Monthly Premium Activations" are the same real trend: new
 * subscriptions per real calendar month by their real startDate.
 */
export async function getPremiumAnalytics(months = 6): Promise<PremiumAnalytics> {
  const monthsAgo = new Date();
  monthsAgo.setMonth(monthsAgo.getMonth() - months);
  monthsAgo.setHours(0, 0, 0, 0);

  const [activeCount, expiredCount, coinBased, direct, adminGranted, telegram, recentActivations, everPremium, grantAudits] = await Promise.all([
    prisma.subscription.findMany({ where: { status: "ACTIVE" }, select: { studentId: true }, distinct: ["studentId"] }),
    prisma.subscription.findMany({ where: { status: "EXPIRED" }, select: { studentId: true }, distinct: ["studentId"] }),
    prisma.subscription.count({ where: { source: "COIN_REDEMPTION" } }),
    prisma.subscription.count({ where: { source: "DIRECT_PAYMENT" } }),
    prisma.subscription.count({ where: { source: "ADMIN_GRANT" } }),
    prisma.subscription.count({ where: { source: "TELEGRAM_PURCHASE" } }),
    prisma.subscription.findMany({ where: { startDate: { gte: monthsAgo }, source: { not: null } }, select: { startDate: true } }),
    prisma.subscription.findMany({ where: { source: { not: null } }, select: { studentId: true }, distinct: ["studentId"] }),
    prisma.trialAuditLog.findMany({ where: { action: "PREMIUM_GRANT" }, orderBy: { createdAt: "asc" }, select: { studentId: true } }),
  ]);

  const byMonth = new Map<string, number>();
  for (const sub of recentActivations) {
    const label = monthLabel(sub.startDate);
    byMonth.set(label, (byMonth.get(label) ?? 0) + 1);
  }

  const monthlyActivations = [...byMonth.entries()]
    .map(([monthLabel, activations]) => ({ monthLabel, activations }))
    .sort((a, b) => a.monthLabel.localeCompare(b.monthLabel))
    .slice(-months);

  const seenGrantStudents = new Set<string>();
  let renewals = 0;
  for (const audit of grantAudits) {
    if (!audit.studentId) continue;
    if (seenGrantStudents.has(audit.studentId)) renewals++;
    else seenGrantStudents.add(audit.studentId);
  }

  return {
    activePremiumUsers: activeCount.length,
    expiredPremiumUsers: expiredCount.length,
    coinBasedActivations: coinBased,
    directActivations: direct,
    adminGrantedActivations: adminGranted,
    telegramActivations: telegram,
    monthlyActivations,
    totalPremiumAccounts: everPremium.length,
    renewals,
  };
}
