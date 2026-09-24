import "server-only";

import { prisma } from "@/lib/prisma";
import { startOfDay, sumSecondsForDay } from "@/lib/study-activity";
import { awardCoins } from "@/lib/coins";

/** A calendar day only counts toward the streak once real study activity (any combination of types) reaches this — 5 minutes of genuine engagement, not just opening a tab. Anti-abuse threshold, not an arbitrary UX number. */
export const MIN_DAILY_SECONDS_FOR_STREAK = 5 * 60;

const STREAK_MILESTONES: { days: number; coins: number }[] = [
  { days: 7, coins: 100 },
  { days: 30, coins: 500 },
  { days: 90, coins: 1000 },
];

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Re-evaluates the streak for "today" against real accumulated study
 * seconds. A no-op until the real daily-engagement threshold is crossed, and
 * a no-op again once today has already been counted (idempotent to call
 * repeatedly, e.g. once per heartbeat). Milestone bonuses use a
 * date-scoped idempotencyKey, so even a duplicate settlement on the exact
 * milestone day can never double-award.
 */
export async function settleStreakForToday(studentId: string): Promise<void> {
  const today = startOfDay(new Date());
  const totalSecondsToday = await sumSecondsForDay(studentId, today);
  if (totalSecondsToday < MIN_DAILY_SECONDS_FOR_STREAK) return;

  const streak = await prisma.studyStreak.upsert({
    where: { studentId },
    create: { studentId, currentStreak: 0, longestStreak: 0, lastActiveDate: null },
    update: {},
  });

  if (streak.lastActiveDate && isSameDay(streak.lastActiveDate, today)) return; // already counted today

  const yesterday = addDays(today, -1);
  const isConsecutive = streak.lastActiveDate != null && isSameDay(streak.lastActiveDate, yesterday);
  const newCurrent = isConsecutive ? streak.currentStreak + 1 : 1;
  const newLongest = Math.max(streak.longestStreak, newCurrent);

  await prisma.studyStreak.update({
    where: { studentId },
    data: { currentStreak: newCurrent, longestStreak: newLongest, lastActiveDate: today },
  });

  const milestone = STREAK_MILESTONES.find((m) => m.days === newCurrent);
  if (milestone) {
    await awardCoins(
      studentId,
      "STREAK_BONUS",
      milestone.coins,
      `STREAK:${studentId}:${milestone.days}:${today.toISOString().slice(0, 10)}`,
      `${milestone.days}-day study streak bonus.`
    );
  }
}

export type StreakSummary = { currentStreak: number; longestStreak: number; lastActiveDate: Date | null };

export async function getStreakSummary(studentId: string): Promise<StreakSummary> {
  const streak = await prisma.studyStreak.findUnique({ where: { studentId } });
  return {
    currentStreak: streak?.currentStreak ?? 0,
    longestStreak: streak?.longestStreak ?? 0,
    lastActiveDate: streak?.lastActiveDate ?? null,
  };
}

function mondayOf(date: Date): Date {
  const d = startOfDay(date);
  const isoDay = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  return addDays(d, -isoDay);
}

function firstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Walks consecutive buckets backward from `anchor`, counting how many in a row have real activity — stops at the first gap. */
function countConsecutiveBuckets(activeBucketKeys: Set<string>, anchor: Date, step: (d: Date, n: number) => Date, keyOf: (d: Date) => string): number {
  let count = 0;
  let cursor = anchor;
  while (activeBucketKeys.has(keyOf(cursor))) {
    count += 1;
    cursor = step(cursor, -1);
  }
  return count;
}

export type StreakBreakdown = StreakSummary & { weeklyStreak: number; monthlyStreak: number };

/**
 * Phase 24 — real weekly/monthly streaks, computed from actual StudyActivity
 * days (not estimated). A week/month "counts" if it has at least one real
 * active day; the streak walks backward from the most recent active
 * week/month so an in-progress current week/month doesn't break it before
 * it's even over.
 */
export async function getStreakBreakdown(studentId: string): Promise<StreakBreakdown> {
  const [summary, activities] = await Promise.all([
    getStreakSummary(studentId),
    prisma.studyActivity.findMany({ where: { studentId }, select: { activityDate: true }, distinct: ["activityDate"] }),
  ]);

  if (activities.length === 0) {
    return { ...summary, weeklyStreak: 0, monthlyStreak: 0 };
  }

  const weekKeys = new Set(activities.map((a) => mondayOf(a.activityDate).toISOString()));
  const monthKeys = new Set(activities.map((a) => firstOfMonth(a.activityDate).toISOString()));

  const mostRecentActivity = activities.reduce((latest, a) => (a.activityDate > latest ? a.activityDate : latest), activities[0].activityDate);

  const weeklyStreak = countConsecutiveBuckets(weekKeys, mondayOf(mostRecentActivity), (d, n) => addDays(d, n * 7), (d) => d.toISOString());
  const monthlyStreak = countConsecutiveBuckets(
    monthKeys,
    firstOfMonth(mostRecentActivity),
    (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1),
    (d) => d.toISOString()
  );

  return { ...summary, weeklyStreak, monthlyStreak };
}
