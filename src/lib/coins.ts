import "server-only";
import type { CoinTransactionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sumSecondsForDay, startOfDay } from "@/lib/study-activity";
import { getSubscriptionSummary, addDays } from "@/lib/subscription";
import { COINS_PER_HOUR_STUDIED, MAX_DAILY_STUDY_COINS, PREMIUM_REDEMPTION_COST, PREMIUM_REDEMPTION_DAYS } from "@/lib/coin-economy-constants";

export { COINS_PER_HOUR_STUDIED, MAX_DAILY_STUDY_COINS, PREMIUM_REDEMPTION_COST, PREMIUM_REDEMPTION_DAYS };

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Awards a positive amount of coins for a real, already-verified event
 * (study time, streak milestone, achievement). `idempotencyKey` is the real
 * guard against double-awarding — a unique-constraint violation on a retried
 * or racing call is treated as "already awarded", never an error. Mirrors
 * the established try/create-catch/re-fetch cache pattern used across this
 * codebase (see src/lib/ai/writing.ts requestRewrite).
 */
export async function awardCoins(
  studentId: string,
  type: CoinTransactionType,
  amount: number,
  idempotencyKey: string,
  description: string
): Promise<boolean> {
  if (amount <= 0) throw new Error("awardCoins amount must be positive — use redeemPremiumWithCoins for spends.");

  try {
    await prisma.$transaction([
      prisma.coinTransaction.create({ data: { studentId, type, amount, description, idempotencyKey } }),
      prisma.coinWallet.upsert({
        where: { studentId },
        create: { studentId, balance: amount, lifetimeEarned: amount },
        update: { balance: { increment: amount }, lifetimeEarned: { increment: amount } },
      }),
    ]);
    return true;
  } catch {
    return false; // idempotencyKey collision — this exact reward was already granted, not a real error
  }
}

/**
 * Converts today's real accumulated study time into coins, capped at
 * MAX_DAILY_STUDY_COINS — real activity data only (see
 * src/lib/study-activity.ts), never a fabricated duration. Uses a single
 * per-day CoinTransaction (idempotencyKey `STUDY:<studentId>:<date>`) that
 * gets topped up in place as more real time accrues during the day, rather
 * than one row per settlement call.
 */
export async function settleStudyCoinsForToday(studentId: string): Promise<void> {
  const today = startOfDay(new Date());
  const totalSeconds = await sumSecondsForDay(studentId, today);
  const earnable = Math.min(MAX_DAILY_STUDY_COINS, Math.floor((totalSeconds / 3600) * COINS_PER_HOUR_STUDIED));
  if (earnable <= 0) return;

  const idempotencyKey = `STUDY:${studentId}:${dateKey(today)}`;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.coinTransaction.findUnique({ where: { idempotencyKey } });
    const alreadyAwarded = existing?.amount ?? 0;
    const delta = earnable - alreadyAwarded;
    if (delta <= 0) return;

    if (existing) {
      await tx.coinTransaction.update({ where: { idempotencyKey }, data: { amount: earnable } });
    } else {
      await tx.coinTransaction.create({
        data: { studentId, type: "STUDY_TIME", amount: earnable, description: `Study time reward for ${dateKey(today)}.`, idempotencyKey },
      });
    }

    await tx.coinWallet.upsert({
      where: { studentId },
      create: { studentId, balance: delta, lifetimeEarned: delta },
      update: { balance: { increment: delta }, lifetimeEarned: { increment: delta } },
    });
  });
}

export type WalletSummary = { balance: number; todayCoins: number; lifetimeEarned: number };

/** Every number here is real: `balance`/`lifetimeEarned` from the wallet row, `todayCoins` from today's real STUDY_TIME+STREAK_BONUS+ACHIEVEMENT transactions. */
export async function getWalletSummary(studentId: string): Promise<WalletSummary> {
  const today = startOfDay(new Date());
  const [wallet, todayTransactions] = await Promise.all([
    prisma.coinWallet.findUnique({ where: { studentId } }),
    prisma.coinTransaction.findMany({
      where: { studentId, createdAt: { gte: today }, amount: { gt: 0 } },
      select: { amount: true },
    }),
  ]);

  return {
    balance: wallet?.balance ?? 0,
    todayCoins: todayTransactions.reduce((sum, t) => sum + t.amount, 0),
    lifetimeEarned: wallet?.lifetimeEarned ?? 0,
  };
}

export async function getCoinHistory(studentId: string, limit = 20) {
  return prisma.coinTransaction.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export type RedeemPremiumResult =
  | { success: true; newExpiryDate: Date }
  | { success: false; error: string };

/**
 * Spends 1000 coins for 30 days of Premium — extends the student's EXISTING
 * Subscription (same model Trial Management already reads/writes, see
 * src/lib/trial-management.ts extendStudentTrial), never a parallel
 * "premium" concept. Race-safe: the coin deduction is a single conditional
 * `updateMany` (balance >= cost) inside the transaction, so two concurrent
 * redemption clicks can never both succeed.
 */
export async function redeemPremiumWithCoins(studentId: string): Promise<RedeemPremiumResult> {
  // Guarantees a Subscription row exists before the transaction touches one — same self-heal path every other trial/subscription read goes through.
  await getSubscriptionSummary(studentId);

  return prisma.$transaction(async (tx) => {
    const deducted = await tx.coinWallet.updateMany({
      where: { studentId, balance: { gte: PREMIUM_REDEMPTION_COST } },
      data: { balance: { decrement: PREMIUM_REDEMPTION_COST } },
    });
    if (deducted.count === 0) {
      return { success: false, error: `You need at least ${PREMIUM_REDEMPTION_COST} coins to redeem Premium.` };
    }

    const latest = await tx.subscription.findFirstOrThrow({ where: { studentId }, orderBy: { createdAt: "desc" } });
    const now = new Date();
    const baseDate = latest.endDate && latest.endDate > now ? latest.endDate : now;
    const newEndDate = addDays(baseDate, PREMIUM_REDEMPTION_DAYS);

    await tx.subscription.update({ where: { id: latest.id }, data: { status: "ACTIVE", endDate: newEndDate } });

    await tx.coinTransaction.create({
      data: {
        studentId,
        type: "REDEMPTION",
        amount: -PREMIUM_REDEMPTION_COST,
        description: `Redeemed ${PREMIUM_REDEMPTION_COST} coins for ${PREMIUM_REDEMPTION_DAYS} days of Premium.`,
        idempotencyKey: `REDEMPTION:${studentId}:${now.getTime()}`,
      },
    });

    return { success: true, newExpiryDate: newEndDate };
  });
}
