import "server-only";

import { prisma } from "@/lib/prisma";
import { addDays, getSubscriptionSummary, type SubscriptionSummary } from "@/lib/subscription";
import { requestPlanTitle, type PremiumPlanCode } from "@/lib/premium-plans";
import { formatPlanPrice } from "@/lib/premium-plan-rules";

async function assertStudentExists(studentId: string): Promise<void> {
  const exists = await prisma.studentProfile.findUnique({ where: { id: studentId }, select: { id: true } });
  if (!exists) throw new Error("Student not found.");
}

// ---------------------------------------------------------------------------
// Student — create a request, view history
// ---------------------------------------------------------------------------

export type PremiumRequestRow = {
  id: string;
  planCode: PremiumPlanCode | null;
  planTitle: string;
  priceLabel: string;
  durationDays: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: Date;
  reviewedAt: Date | null;
  /** Only meaningful once APPROVED — the real Subscription.endDate that resulted, not a guess. */
  expiresAt: Date | null;
};

/**
 * Phase 30 — Part 4. Creates the one real purchase record for a Telegram
 * "buy" click — no payment gateway, so this PENDING row genuinely is the
 * entire transaction until a root teacher reviews it.
 */
export async function createPremiumRequest(studentId: string, planId: string) {
  const plan = await prisma.premiumPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) throw new Error("This plan is not available any more. Reload the page.");
  // Phase R - the name, price and currency as the student saw them are stored with the request.
  return prisma.premiumRequest.create({
    data: {
      studentId,
      planId: plan.id,
      planName: plan.name,
      planCode: plan.legacyCode,
      priceLabel: formatPlanPrice(plan.price, plan.currency),
      priceAmount: plan.price,
      priceCurrency: plan.currency,
      durationDays: plan.durationDays,
    },
  });
}

export async function listPremiumRequestsForStudent(studentId: string): Promise<PremiumRequestRow[]> {
  const requests = await prisma.premiumRequest.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
  });

  // The real endDate an APPROVED request resulted in — read once, reused
  // for every approved row (a student only ever has one current
  // Subscription, updated in place, never one row per request).
  const subscription = requests.some((r) => r.status === "APPROVED")
    ? await prisma.subscription.findFirst({ where: { studentId }, orderBy: { createdAt: "desc" }, select: { endDate: true } })
    : null;

  return requests.map((r) => ({
    id: r.id,
    planCode: r.planCode,
    planTitle: requestPlanTitle(r),
    priceLabel: r.priceLabel,
    durationDays: r.durationDays,
    status: r.status,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    expiresAt: r.status === "APPROVED" ? (subscription?.endDate ?? null) : null,
  }));
}

// ---------------------------------------------------------------------------
// Root teacher — review queue
// ---------------------------------------------------------------------------

export type PremiumRequestForReview = PremiumRequestRow & {
  studentId: string;
  studentName: string | null;
  studentEmail: string;
};

export async function listPremiumRequestsForRoot(): Promise<PremiumRequestForReview[]> {
  const requests = await prisma.premiumRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: { student: { select: { id: true, user: { select: { name: true, email: true } } } } },
  });

  return requests.map((r) => ({
    id: r.id,
    studentId: r.student.id,
    studentName: r.student.user.name,
    studentEmail: r.student.user.email,
    planCode: r.planCode,
    planTitle: requestPlanTitle(r),
    priceLabel: r.priceLabel,
    durationDays: r.durationDays,
    status: r.status,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    expiresAt: null,
  }));
}

export type PremiumRequestActionResult = { success: true; summary?: SubscriptionSummary } | { success: false; error: string };

/**
 * Phase 30 — Part 6. Root-only. Same real "extend from later of now or
 * current endDate" pattern as grantPremium (Phase 26) — a still-active
 * plan is genuinely extended, never wastefully overwritten. Sets
 * source: "TELEGRAM_PURCHASE" so Premium Analytics (Phase 29) can tell
 * this apart from a coin redemption or a future real payment gateway.
 */
export async function approvePremiumRequest(isActingTeacherRoot: boolean, rootTeacherId: string, requestId: string): Promise<PremiumRequestActionResult> {
  if (!isActingTeacherRoot) {
    return { success: false, error: "Only the root teacher can approve Premium requests." };
  }

  const request = await prisma.premiumRequest.findUnique({ where: { id: requestId } });
  if (!request) return { success: false, error: "Request not found." };
  if (request.status !== "PENDING") return { success: false, error: "This request has already been reviewed." };

  try {
    await assertStudentExists(request.studentId);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Student not found." };
  }

  await getSubscriptionSummary(request.studentId);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const latest = await tx.subscription.findFirstOrThrow({ where: { studentId: request.studentId }, orderBy: { createdAt: "desc" } });
    const previousExpiryDate = latest.endDate;
    const baseDate = latest.endDate && latest.endDate > now ? latest.endDate : now;
    const newEndDate = addDays(baseDate, request.durationDays);

    await tx.subscription.update({
      where: { id: latest.id },
      data: { status: "ACTIVE", endDate: newEndDate, source: "TELEGRAM_PURCHASE" },
    });

    await tx.premiumRequest.update({
      where: { id: requestId },
      data: { status: "APPROVED", reviewedById: rootTeacherId, reviewedAt: now },
    });

    await tx.trialAuditLog.create({
      data: { rootTeacherId, studentId: request.studentId, action: "PREMIUM_TELEGRAM_APPROVE", previousExpiryDate, newExpiryDate: newEndDate },
    });
  });

  // Real one-time achievement (FIRST_PREMIUM_MONTH) — idempotency-guarded, never double-awarded.
  const { syncAchievements } = await import("@/lib/achievements");
  await syncAchievements(request.studentId);

  return { success: true, summary: await getSubscriptionSummary(request.studentId) };
}

export async function rejectPremiumRequest(isActingTeacherRoot: boolean, rootTeacherId: string, requestId: string): Promise<PremiumRequestActionResult> {
  if (!isActingTeacherRoot) {
    return { success: false, error: "Only the root teacher can reject Premium requests." };
  }

  const request = await prisma.premiumRequest.findUnique({ where: { id: requestId } });
  if (!request) return { success: false, error: "Request not found." };
  if (request.status !== "PENDING") return { success: false, error: "This request has already been reviewed." };

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.premiumRequest.update({ where: { id: requestId }, data: { status: "REJECTED", reviewedById: rootTeacherId, reviewedAt: now } });
    await tx.trialAuditLog.create({
      data: { rootTeacherId, studentId: request.studentId, action: "PREMIUM_TELEGRAM_REJECT", previousExpiryDate: null, newExpiryDate: now },
    });
  });

  return { success: true };
}
