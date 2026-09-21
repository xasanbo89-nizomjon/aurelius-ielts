import "server-only";
import { randomBytes } from "crypto";

import { prisma } from "@/lib/prisma";
import { addDays, getSubscriptionSummary } from "@/lib/subscription";

/** Every promo code is system-generated: AZ + 6 random uppercase letters/digits. Never typed by a teacher. */
export const PROMO_CODE_PREFIX = "AZ";
const RANDOM_SUFFIX_LENGTH = 6;
const RANDOM_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const MAX_GENERATION_ATTEMPTS = 10;

function randomSuffix(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += RANDOM_ALPHABET[bytes[i] % RANDOM_ALPHABET.length];
  }
  return out;
}

async function generateUniquePromoCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const code = `${PROMO_CODE_PREFIX}${randomSuffix(RANDOM_SUFFIX_LENGTH)}`;
    const existing = await prisma.promoCode.findUnique({ where: { code }, select: { id: true } });
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique promo code. Please try again.");
}

export type PromoCodeFields = {
  discountPercent: number;
  bonusTrialDays: number;
  maxUses: number | null;
  expiresAt: Date | null;
};

/** The code itself is always generated here — teachers only supply terms, never the code string. */
export async function createPromoCode(teacherId: string, input: PromoCodeFields) {
  const code = await generateUniquePromoCode();
  return prisma.promoCode.create({
    data: {
      code,
      type: "PERCENTAGE",
      value: input.discountPercent,
      bonusTrialDays: input.bonusTrialDays,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt,
      createdById: teacherId,
    },
  });
}

/** The code string itself is immutable once generated — only its terms can be edited. */
export async function updatePromoCode(promoCodeId: string, teacherId: string, input: PromoCodeFields): Promise<void> {
  const result = await prisma.promoCode.updateMany({
    where: { id: promoCodeId, createdById: teacherId },
    data: {
      value: input.discountPercent,
      bonusTrialDays: input.bonusTrialDays,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt,
    },
  });
  if (result.count === 0) throw new Error("Promo code not found.");
}

export async function setPromoCodeActive(promoCodeId: string, teacherId: string, isActive: boolean): Promise<void> {
  const result = await prisma.promoCode.updateMany({
    where: { id: promoCodeId, createdById: teacherId },
    data: { isActive },
  });
  if (result.count === 0) throw new Error("Promo code not found.");
}

/** Blocked once a code has real redemptions — deleting it would destroy real usage history. Disable it instead. */
export async function deletePromoCode(promoCodeId: string, teacherId: string): Promise<void> {
  const code = await prisma.promoCode.findFirst({ where: { id: promoCodeId, createdById: teacherId } });
  if (!code) throw new Error("Promo code not found.");
  if (code.usedCount > 0) {
    throw new Error("This code has real redemptions and can't be deleted — disable it instead.");
  }
  await prisma.promoCode.delete({ where: { id: promoCodeId } });
}

export async function listPromoCodesForTeacher(teacherId: string, search?: string) {
  return prisma.promoCode.findMany({
    where: {
      createdById: teacherId,
      ...(search ? { code: { contains: search, mode: "insensitive" as const } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export type PromoCodeAnalytics = {
  totalCodes: number;
  activeCodes: number;
  totalRedemptions: number;
  revenueImpact: number;
};

/**
 * Every number here is a real query — "activeCodes" means actually usable
 * right now (enabled, not expired, under its usage limit), not just the
 * isActive flag in isolation. "revenueImpact" sums real COMPLETED payments
 * that cite one of this teacher's codes — it's honestly $0 until a real
 * payment provider is wired up, never an invented projection.
 */
export async function getPromoCodeAnalytics(teacherId: string): Promise<PromoCodeAnalytics> {
  const codes = await prisma.promoCode.findMany({
    where: { createdById: teacherId },
    select: { isActive: true, expiresAt: true, maxUses: true, usedCount: true },
  });

  const now = new Date();
  const activeCodes = codes.filter(
    (code) =>
      code.isActive &&
      (!code.expiresAt || code.expiresAt > now) &&
      (code.maxUses == null || code.usedCount < code.maxUses)
  ).length;
  const totalRedemptions = codes.reduce((sum, code) => sum + code.usedCount, 0);

  const revenue = await prisma.payment.aggregate({
    where: { status: "COMPLETED", promoCode: { createdById: teacherId } },
    _sum: { amount: true },
  });

  return {
    totalCodes: codes.length,
    activeCodes,
    totalRedemptions,
    revenueImpact: revenue._sum.amount ?? 0,
  };
}

export type RedemptionHistoryRow = {
  id: string;
  code: string;
  discountPercent: number | null;
  bonusTrialDays: number;
  redeemedAt: Date;
};

/** Real redemption history for one student — what they've actually applied to their account. */
export async function listRedemptionsForStudent(studentId: string): Promise<RedemptionHistoryRow[]> {
  const rows = await prisma.promoCodeRedemption.findMany({
    where: { studentId },
    orderBy: { redeemedAt: "desc" },
    include: { promoCode: { select: { code: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.promoCode.code,
    discountPercent: row.discountPercent,
    bonusTrialDays: row.bonusTrialDays,
    redeemedAt: row.redeemedAt,
  }));
}

export type RedeemPromoCodeResult =
  | { success: true; discountPercent: number | null; bonusTrialDays: number; daysRemaining: number | null }
  | { success: false; error: string };

/**
 * Validates every rule server-side (exists, not disabled, not expired, under
 * its usage limit, not already redeemed by this student), then applies the
 * real benefit atomically: bonus trial days extend an active trial/
 * subscription, or start a fresh one if the student had none/had expired.
 * A discount-only code (0 bonus days) never touches the subscription.
 */
export async function redeemPromoCode(studentId: string, rawCode: string): Promise<RedeemPromoCodeResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { success: false, error: "Enter a promo code." };

  const promoCode = await prisma.promoCode.findUnique({ where: { code } });
  if (!promoCode) return { success: false, error: "That promo code doesn't exist." };
  if (!promoCode.isActive) return { success: false, error: "That promo code has been disabled." };
  if (promoCode.expiresAt && promoCode.expiresAt <= new Date()) {
    return { success: false, error: "That promo code has expired." };
  }

  // Checked before the usage limit on purpose: if this student already
  // redeemed this exact code, that's the true, specific reason they can't
  // redeem it again — even if it's *also* since hit its overall usage limit,
  // "you already redeemed this" is the accurate message, not a misleading
  // "it's out of uses" that implies someone else used up their chance.
  const alreadyRedeemed = await prisma.promoCodeRedemption.findUnique({
    where: { promoCodeId_studentId: { promoCodeId: promoCode.id, studentId } },
  });
  if (alreadyRedeemed) return { success: false, error: "You've already redeemed this promo code." };

  if (promoCode.maxUses != null && promoCode.usedCount >= promoCode.maxUses) {
    return { success: false, error: "That promo code has reached its usage limit." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Optimistic concurrency: re-check the usage limit inside the write
      // itself, so two students can't both claim the last slot in a race.
      const claimed = await tx.promoCode.updateMany({
        where: { id: promoCode.id, usedCount: promoCode.usedCount },
        data: { usedCount: { increment: 1 } },
      });
      if (claimed.count === 0) throw new Error("REDEMPTION_RACE");

      await tx.promoCodeRedemption.create({
        data: {
          promoCodeId: promoCode.id,
          studentId,
          discountPercent: promoCode.type === "PERCENTAGE" ? promoCode.value : null,
          bonusTrialDays: promoCode.bonusTrialDays,
        },
      });

      if (promoCode.bonusTrialDays > 0) {
        const now = new Date();
        const current = await tx.subscription.findFirst({ where: { studentId }, orderBy: { createdAt: "desc" } });
        const currentIsActive =
          current &&
          (current.status === "TRIAL" || current.status === "ACTIVE") &&
          current.endDate != null &&
          current.endDate > now;

        if (currentIsActive && current) {
          await tx.subscription.update({
            where: { id: current.id },
            data: { endDate: addDays(current.endDate as Date, promoCode.bonusTrialDays) },
          });
        } else {
          await tx.subscription.create({
            data: {
              studentId,
              status: "TRIAL",
              startDate: now,
              endDate: addDays(now, promoCode.bonusTrialDays),
            },
          });
        }
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "REDEMPTION_RACE") {
      return { success: false, error: "That promo code just reached its usage limit." };
    }
    throw error;
  }

  const summary = await getSubscriptionSummary(studentId);
  return {
    success: true,
    discountPercent: promoCode.type === "PERCENTAGE" ? promoCode.value : null,
    bonusTrialDays: promoCode.bonusTrialDays,
    daysRemaining: summary.daysRemaining,
  };
}
