import "server-only";
import { cache } from "react";

import { prisma } from "@/lib/prisma";

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Daily Login Streak (dashboard header). Consecutive CALENDAR days this
 * user has visited a dashboard page — increments the first time they visit
 * on a new day, resets to 1 if a day was missed. Deliberately separate from
 * the Phase 15 StudyStreak (StudentProfile-only, gated behind 5 minutes of
 * real study activity): this lives on User because both Students and
 * Teachers see it in the shared dashboard header, and it counts a mere
 * visit, not a study threshold.
 *
 * Safe to call on every dashboard layout render — it's a no-op read (no
 * write) for every visit after the first one on a given day. Wrapped in
 * React's cache() so the layout and a page that both need the streak count
 * within the same request (Phase 28 mobile dashboard widgets) share one
 * call instead of writing twice.
 */
export const recordLoginAndGetStreak = cache(async (userId: string): Promise<number> => {
  const today = startOfDay(new Date());

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentLoginStreak: true, longestLoginStreak: true, lastLoginDate: true },
  });
  if (!user) return 0;

  if (user.lastLoginDate && isSameDay(user.lastLoginDate, today)) {
    return user.currentLoginStreak;
  }

  const yesterday = addDays(today, -1);
  const isConsecutive = user.lastLoginDate != null && isSameDay(user.lastLoginDate, yesterday);
  const newCurrent = isConsecutive ? user.currentLoginStreak + 1 : 1;
  const newLongest = Math.max(user.longestLoginStreak, newCurrent);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { currentLoginStreak: newCurrent, longestLoginStreak: newLongest, lastLoginDate: today },
    select: { currentLoginStreak: true },
  });

  return updated.currentLoginStreak;
});
