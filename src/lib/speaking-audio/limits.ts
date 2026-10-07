import { DEFAULT_DAILY_SPEAKING_PRACTICES, LIMIT_TIME_ZONE, MAX_DAILY_LIMIT } from "@/lib/speaking-audio/constants";

/**
 * Phase Q-B - the daily limit of recorded practices, pure. The count is of practices whose recording ARRIVED today (a recording that never finished uploading is not
 * counted once its reservation has run out, and a failed assessment that is tried again is the same practice: it never counts twice).
 *
 * "Today" is the calendar day in the students' own time zone (Asia/Tashkent), not the server's: a server in another zone would otherwise reset the limit in the middle
 * of the students' afternoon or night.
 */

/** The offset of a time zone from UTC at an instant, in milliseconds (positive east of Greenwich). */
function zoneOffsetMs(timeZone: string, at: Date): number {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of format.formatToParts(at)) parts[part.type] = part.value;
  const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return localAsUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The instant a calendar day (month 1-12) begins in a time zone. */
export function zonedMidnight(timeZone: string, year: number, month: number, day: number): Date {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  return new Date(guess - zoneOffsetMs(timeZone, new Date(guess)));
}

/** The calendar date (in the zone) an instant falls on. */
export function localDate(timeZone: string, at: Date): { year: number; month: number; day: number } {
  const format = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts: Record<string, string> = {};
  for (const part of format.formatToParts(at)) parts[part.type] = part.value;
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

/** When the current day began (in the students' time zone). */
export function startOfDay(now: Date, timeZone: string = LIMIT_TIME_ZONE): Date {
  const { year, month, day } = localDate(timeZone, now);
  return zonedMidnight(timeZone, year, month, day);
}

/** When the next day begins - the moment the daily limit starts again. */
export function nextDayStart(now: Date, timeZone: string = LIMIT_TIME_ZONE): Date {
  const { year, month, day } = localDate(timeZone, now);
  // Day 32 of a month rolls over to the first of the next one, so the arithmetic of month lengths is left to Date.
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return zonedMidnight(timeZone, next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/** The first instant of a calendar month in the zone, and of the month after it (month 1-12). */
export function monthRange(year: number, month: number, timeZone: string = LIMIT_TIME_ZONE): { start: Date; end: Date } {
  const following = new Date(Date.UTC(year, month, 1));
  return { start: zonedMidnight(timeZone, year, month, 1), end: zonedMidnight(timeZone, following.getUTCFullYear(), following.getUTCMonth() + 1, 1) };
}

/** The limit as stored (a whole number 1..MAX_DAILY_LIMIT) or the default. */
export function effectiveDailyLimit(stored: number | null | undefined): number {
  if (typeof stored !== "number" || !Number.isFinite(stored)) return DEFAULT_DAILY_SPEAKING_PRACTICES;
  return Math.min(MAX_DAILY_LIMIT, Math.max(1, Math.floor(stored)));
}

export type DailyAllowance = { limit: number; used: number; remaining: number; allowed: boolean };

export function dailyAllowance(limit: number, usedToday: number): DailyAllowance {
  const remaining = Math.max(0, limit - usedToday);
  return { limit, used: usedToday, remaining, allowed: remaining > 0 };
}

/** The sentence a student reads when today's practices are used up. */
export const dailyLimitMessage = (limit: number): string =>
  `You have used all ${limit} of today's recorded speaking practices. They come back tomorrow - you can still read your earlier feedback.`;
