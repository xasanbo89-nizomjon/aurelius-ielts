import "server-only";

import { prisma } from "@/lib/prisma";
import { getSubscriptionSummary } from "@/lib/subscription";

export type PremiumIdentity = {
  isPremium: boolean;
  planName: string | null;
  expiresAt: Date | null;
  daysRemaining: number | null;
};

/**
 * Phase 39 — Part 1. Reuses getSubscriptionSummary entirely (never
 * duplicates its trial-creation/staleness-reconciliation logic) and adds
 * only the real plan name lookup on top, for the Premium badge/status UI.
 */
export async function getPremiumIdentity(studentId: string): Promise<PremiumIdentity> {
  const summary = await getSubscriptionSummary(studentId);

  const planName = summary.subscription.planId
    ? (await prisma.subscriptionPlan.findUnique({ where: { id: summary.subscription.planId }, select: { name: true } }))?.name ?? null
    : null;

  return {
    isPremium: summary.isPremium,
    planName,
    expiresAt: summary.isPremium ? summary.subscription.endDate : null,
    daysRemaining: summary.isPremium ? summary.daysRemaining : null,
  };
}

/**
 * Batched real premium check for a list of students (e.g. the Leaderboard)
 * — one query, not N. A student's most recent Subscription row is used
 * directly (status === "ACTIVE" and, if it has a real endDate, that date
 * hasn't passed) rather than calling getSubscriptionSummary per student,
 * which would also perform an unnecessary per-student write-reconciliation
 * in a read-only listing context.
 */
export async function getPremiumStatusMap(studentIds: string[]): Promise<Map<string, boolean>> {
  if (studentIds.length === 0) return new Map();

  const subscriptions = await prisma.subscription.findMany({
    where: { studentId: { in: studentIds } },
    orderBy: { createdAt: "desc" },
    select: { studentId: true, status: true, endDate: true },
  });

  const now = new Date();
  const map = new Map<string, boolean>();
  for (const sub of subscriptions) {
    if (map.has(sub.studentId)) continue; // keep only the most recent row per student (already ordered desc)
    const isPremium = sub.status === "ACTIVE" && (sub.endDate == null || sub.endDate > now);
    map.set(sub.studentId, isPremium);
  }
  return map;
}
