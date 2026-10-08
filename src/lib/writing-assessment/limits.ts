import { DEFAULT_DAILY_WRITING_ASSESSMENTS, MAX_WRITING_DAILY_LIMIT } from "@/lib/writing-assessment/constants";

export { monthRange, nextDayStart, startOfDay } from "@/lib/speaking-audio/limits";

/**
 * Phase O - the daily limit of AI Writing assessments, pure. The count is of assessments made today for a student (a retry of the same assessment is the same sitting
 * and never counts twice; one that was refused for the limit itself costs nothing and does not count). "Today" is the calendar day in the students' time zone
 * (Asia/Tashkent), the same day the Speaking practice limit uses.
 *
 * The limit never stops a hand-in: the essays are always accepted. An assessment over the limit is simply not run (it is shown as waiting for tomorrow, with Try again).
 */

/** The limit as stored (a whole number 1..MAX) or the default. */
export function effectiveWritingLimit(stored: number | null | undefined): number {
  if (typeof stored !== "number" || !Number.isFinite(stored)) return DEFAULT_DAILY_WRITING_ASSESSMENTS;
  return Math.min(MAX_WRITING_DAILY_LIMIT, Math.max(1, Math.floor(stored)));
}

export type WritingAllowance = { limit: number; used: number; remaining: number; allowed: boolean };

export function writingAllowance(limit: number, usedToday: number): WritingAllowance {
  const remaining = Math.max(0, limit - usedToday);
  return { limit, used: usedToday, remaining, allowed: remaining > 0 };
}
