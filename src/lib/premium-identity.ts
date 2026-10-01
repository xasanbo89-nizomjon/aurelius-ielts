import "server-only";

import { prisma } from "@/lib/prisma";
import { getSubscriptionSummary } from "@/lib/subscription";
import { getPremiumPlan } from "@/lib/premium-plans";

export type PremiumIdentity = {
  isPremium: boolean;
  planName: string | null;
  expiresAt: Date | null;
  daysRemaining: number | null;
};

/**
 * Phase 39 — Part 1 (Phase 48 — Part 6 extended the real plan-name lookup).
 * Reuses getSubscriptionSummary entirely (never duplicates its
 * trial-creation/staleness-reconciliation logic). A real plan name is
 * resolved in priority order from real data: (1) the teacher-configurable
 * SubscriptionPlan, if this subscription is tied to one; (2) otherwise the
 * student's own most recent APPROVED Telegram PremiumRequest's real plan
 * title (the actual live purchase path — see src/lib/premium-plans.ts); (3)
 * a generic "Premium" fallback for every other real way to become
 * Premium (admin grant, promo code) where no specific tier is recorded.
 * Never invented — "Premium" is an honest fallback, not a guess.
 */
export async function getPremiumIdentity(studentId: string): Promise<PremiumIdentity> {
  const summary = await getSubscriptionSummary(studentId);

  let planName: string | null = summary.subscription.planId
    ? (await prisma.subscriptionPlan.findUnique({ where: { id: summary.subscription.planId }, select: { name: true } }))?.name ?? null
    : null;

  if (!planName && summary.isPremium) {
    const lastApprovedRequest = await prisma.premiumRequest.findFirst({
      where: { studentId, status: "APPROVED" },
      orderBy: { reviewedAt: "desc" },
      select: { planCode: true },
    });
    planName = lastApprovedRequest ? getPremiumPlan(lastApprovedRequest.planCode).title : "Premium";
  }

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
