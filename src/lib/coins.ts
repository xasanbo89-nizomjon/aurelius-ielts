import "server-only";
import type { CoinTransactionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sumSecondsForDay, startOfDay } from "@/lib/study-activity";
import { getSubscriptionSummary, addDays } from "@/lib/subscription";
import { COINS_PER_HOUR_STUDIED, MAX_DAILY_STUDY_COINS, PREMIUM_REDEMPTION_COST, PREMIUM_REDEMPTION_DAYS } from "@/lib/coin-economy-constants";

export { COINS_PER_HOUR_STUDIED, MAX_DAILY_STUDY_COINS, PREMIUM_REDEMPTION_COST, PREMIUM_REDEMPTION_DAYS };

const WEEKLY_BONUS_MIN_DAYS = 5;
const WEEKLY_BONUS_COINS = 50;
const MONTHLY_BONUS_MIN_DAYS = 20;
const MONTHLY_BONUS_COINS = 150;

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Phase 26 — Study Coin Rewards' configurable daily cap (mirrors
 * getDailyVocabularyAiLimit/getDailyWritingActionLimit's exact pattern: a
 * per-teacher AiSettings override, falling back to the platform default).
 */
export async function getDailyStudyCoinCap(teacherId: string | null): Promise<number> {
  if (!teacherId) return MAX_DAILY_STUDY_COINS;
  const settings = await prisma.aiSettings.findUnique({ where: { teacherId } });
  return settings?.dailyStudyCoinCap ?? MAX_DAILY_STUDY_COINS;
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
 * Converts today's real accumulated study time into coins, capped at this
 * student's teacher's configured daily cap — real activity data only (see
 * src/lib/study-activity.ts), never a fabricated duration. Uses a single
 * per-day CoinTransaction (idempotencyKey `STUDY:<studentId>:<date>`) that
 * gets topped up in place as more real time accrues during the day, rather
 * than one row per settlement call.
 */
export async function settleStudyCoinsForToday(studentId: string): Promise<void> {
  const today = startOfDay(new Date());
  const [totalSeconds, student] = await Promise.all([
    sumSecondsForDay(studentId, today),
    prisma.studentProfile.findUnique({ where: { id: studentId }, select: { teacherId: true } }),
  ]);
  const dailyCap = await getDailyStudyCoinCap(student?.teacherId ?? null);
  const earnable = Math.min(dailyCap, Math.floor((totalSeconds / 3600) * COINS_PER_HOUR_STUDIED));
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

/**
 * Phase 26 — a real weekly consistency bonus: at least
 * WEEKLY_BONUS_MIN_DAYS distinct real study days within the current ISO
 * week. Idempotency key is scoped to the week itself, so it can only ever
 * pay out once per student per real calendar week.
 */
export async function settleWeeklyBonus(studentId: string): Promise<void> {
  const now = new Date();
  const idempotencyKey = `WEEKLY_BONUS:${studentId}:${isoWeekKey(now)}`;
  // Cheap indexed lookup first — skips the heavier distinct-day count on
  // every subsequent heartbeat once this week's bonus already paid out.
  const already = await prisma.coinTransaction.findUnique({ where: { idempotencyKey }, select: { id: true } });
  if (already) return;

  const weekStart = startOfWeekMonday(now);
  const activeDays = await prisma.studyActivity.findMany({
    where: { studentId, activityDate: { gte: weekStart } },
    select: { activityDate: true },
    distinct: ["activityDate"],
  });
  if (activeDays.length < WEEKLY_BONUS_MIN_DAYS) return;

  await awardCoins(studentId, "WEEKLY_BONUS", WEEKLY_BONUS_COINS, idempotencyKey, `Weekly consistency bonus — studied ${activeDays.length} days this week.`);
}

/** Same real logic as settleWeeklyBonus, scoped to the current calendar month. */
export async function settleMonthlyBonus(studentId: string): Promise<void> {
  const now = new Date();
  const idempotencyKey = `MONTHLY_BONUS:${studentId}:${monthKey(now)}`;
  const already = await prisma.coinTransaction.findUnique({ where: { idempotencyKey }, select: { id: true } });
  if (already) return;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const activeDays = await prisma.studyActivity.findMany({
    where: { studentId, activityDate: { gte: monthStart } },
    select: { activityDate: true },
    distinct: ["activityDate"],
  });
  if (activeDays.length < MONTHLY_BONUS_MIN_DAYS) return;

  await awardCoins(studentId, "MONTHLY_BONUS", MONTHLY_BONUS_COINS, idempotencyKey, `Monthly consistency bonus — studied ${activeDays.length} days this month.`);
}

function startOfWeekMonday(date: Date): Date {
  const d = startOfDay(date);
  const isoDay = (d.getDay() + 6) % 7;
  return addDays(d, -isoDay);
}

export type WalletSummary = {
  balance: number;
  todayCoins: number;
  lifetimeEarned: number;
  /** Phase 26 — real sum of every negative-amount transaction (redemptions, admin deductions), shown as a positive number. */
  totalSpent: number;
  weekCoins: number;
  monthCoins: number;
};

/** Every number here is real: `balance`/`lifetimeEarned` from the wallet row, the rest from real CoinTransaction rows in the matching real date range. */
export async function getWalletSummary(studentId: string): Promise<WalletSummary> {
  const now = new Date();
  const today = startOfDay(now);
  const weekStart = startOfWeekMonday(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [wallet, todayTx, weekTx, monthTx, spentTx] = await Promise.all([
    prisma.coinWallet.findUnique({ where: { studentId } }),
    prisma.coinTransaction.findMany({ where: { studentId, createdAt: { gte: today }, amount: { gt: 0 } }, select: { amount: true } }),
    prisma.coinTransaction.findMany({ where: { studentId, createdAt: { gte: weekStart }, amount: { gt: 0 } }, select: { amount: true } }),
    prisma.coinTransaction.findMany({ where: { studentId, createdAt: { gte: monthStart }, amount: { gt: 0 } }, select: { amount: true } }),
    prisma.coinTransaction.findMany({ where: { studentId, amount: { lt: 0 } }, select: { amount: true } }),
  ]);

  return {
    balance: wallet?.balance ?? 0,
    todayCoins: todayTx.reduce((sum, t) => sum + t.amount, 0),
    lifetimeEarned: wallet?.lifetimeEarned ?? 0,
    totalSpent: Math.abs(spentTx.reduce((sum, t) => sum + t.amount, 0)),
    weekCoins: weekTx.reduce((sum, t) => sum + t.amount, 0),
    monthCoins: monthTx.reduce((sum, t) => sum + t.amount, 0),
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

  const result = await prisma.$transaction(async (tx) => {
    const deducted = await tx.coinWallet.updateMany({
      where: { studentId, balance: { gte: PREMIUM_REDEMPTION_COST } },
      data: { balance: { decrement: PREMIUM_REDEMPTION_COST } },
    });
    if (deducted.count === 0) {
      return { success: false, error: `You need at least ${PREMIUM_REDEMPTION_COST} coins to redeem Premium.` } as const;
    }

    const latest = await tx.subscription.findFirstOrThrow({ where: { studentId }, orderBy: { createdAt: "desc" } });
    const now = new Date();
    const baseDate = latest.endDate && latest.endDate > now ? latest.endDate : now;
    const newEndDate = addDays(baseDate, PREMIUM_REDEMPTION_DAYS);
    const isFirstPremium = latest.status !== "ACTIVE";

    await tx.subscription.update({
      where: { id: latest.id },
      data: { status: "ACTIVE", endDate: newEndDate, source: "COIN_REDEMPTION" },
    });

    await tx.coinTransaction.create({
      data: {
        studentId,
        type: "REDEMPTION",
        amount: -PREMIUM_REDEMPTION_COST,
        description: `Redeemed ${PREMIUM_REDEMPTION_COST} coins for ${PREMIUM_REDEMPTION_DAYS} days of Premium.`,
        idempotencyKey: `REDEMPTION:${studentId}:${now.getTime()}`,
      },
    });

    return { success: true, newExpiryDate: newEndDate, isFirstPremium } as const;
  });

  if (result.success) {
    // Outside the transaction (its own idempotency-guarded write) — a real
    // one-time achievement, never double-awarded on a later redemption.
    const { syncAchievements } = await import("@/lib/achievements");
    await syncAchievements(studentId);
  }

  return result;
}

export type AdminCoinAdjustmentResult = { success: true } | { success: false; error: string };

/**
 * Phase 26 — Admin Premium Control's "Add Coins / Remove Coins", root-
 * teacher-only. A positive `amount` grants, negative deducts — deducting is
 * the same race-safe conditional `updateMany` pattern as redemption, so an
 * admin can never push a student's balance negative even under a race. The
 * resulting CoinTransaction row (type ADMIN_GRANT/ADMIN_DEDUCT) IS the audit
 * log entry — "View Coin Logs" just queries these rows.
 */
export async function adminAdjustCoins(
  isRoot: boolean,
  studentId: string,
  amount: number,
  reason: string
): Promise<AdminCoinAdjustmentResult> {
  if (!isRoot) return { success: false, error: "Only a root administrator can adjust student coin balances." };
  if (!Number.isInteger(amount) || amount === 0) return { success: false, error: "Enter a non-zero whole number of coins." };

  const type: CoinTransactionType = amount > 0 ? "ADMIN_GRANT" : "ADMIN_DEDUCT";
  const idempotencyKey = `${type}:${studentId}:${Date.now()}`;
  const description = reason.trim() || (amount > 0 ? "Coins granted by admin." : "Coins removed by admin.");

  if (amount < 0) {
    const result = await prisma.$transaction(async (tx) => {
      const deducted = await tx.coinWallet.updateMany({
        where: { studentId, balance: { gte: Math.abs(amount) } },
        data: { balance: { decrement: Math.abs(amount) } },
      });
      if (deducted.count === 0) {
        return { success: false, error: "This student doesn't have enough coins for that deduction." } as const;
      }
      await tx.coinTransaction.create({ data: { studentId, type, amount, description, idempotencyKey } });
      return { success: true } as const;
    });
    return result;
  }

  const awarded = await awardCoins(studentId, type, amount, idempotencyKey, description);
  return awarded ? { success: true } : { success: false, error: "Could not grant coins." };
}
