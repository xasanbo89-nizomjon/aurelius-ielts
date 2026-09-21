import "server-only";
import type { StudyActivityType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { settleStreakForToday } from "@/lib/streaks";
import { settleStudyCoinsForToday } from "@/lib/coins";
import { syncAchievements } from "@/lib/achievements";

/** Client pings roughly this often while genuinely focused on a practice page. */
export const HEARTBEAT_INTERVAL_SECONDS = 30;
/** Real elapsed-time cap per heartbeat (a little over the interval, for network jitter) — the server never trusts a client-supplied duration, only wall-clock time between its own timestamps. */
const MAX_CREDIT_PER_HEARTBEAT_SECONDS = 40;
/** A small, one-time bootstrap credit for the very first heartbeat of a fresh (student, type, day) — there's no prior timestamp to measure a real delta from yet. */
const FIRST_HEARTBEAT_BOOTSTRAP_SECONDS = 5;

export function startOfDay(date: Date): Date {
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

/** Every read of "today's total real study seconds", used by both the coin and streak settlers. */
export async function sumSecondsForDay(studentId: string, day: Date): Promise<number> {
  const rows = await prisma.studyActivity.findMany({
    where: { studentId, activityDate: startOfDay(day) },
    select: { durationSeconds: true },
  });
  return rows.reduce((sum, row) => sum + row.durationSeconds, 0);
}

/**
 * Adds real, server-computed seconds to today's (student, type) row, then
 * settles the streak/coins/achievements side-effects that depend on real
 * activity — the single integration point every real-activity source
 * (heartbeat pings AND the exam-attempt completion hook) goes through.
 */
export async function recordStudentActivity(studentId: string, type: StudyActivityType, seconds: number): Promise<void> {
  if (seconds <= 0) return;
  const today = startOfDay(new Date());

  await prisma.studyActivity.upsert({
    where: { studentId_type_activityDate: { studentId, type, activityDate: today } },
    create: { studentId, type, activityDate: today, durationSeconds: seconds, lastHeartbeatAt: new Date() },
    update: { durationSeconds: { increment: seconds }, lastHeartbeatAt: new Date() },
  });

  await Promise.all([settleStreakForToday(studentId), settleStudyCoinsForToday(studentId), syncAchievements(studentId)]);
}

export type HeartbeatResult = { creditedSeconds: number };

/**
 * Called every ~30s by a client hook mounted on a genuinely active practice
 * page (Vocabulary/Writing/Article — Reading/Listening use the real
 * exam-attempt duration instead, see src/lib/exam/attempts.ts). The credited
 * duration is always `min(real elapsed wall-clock time since the last real
 * heartbeat, a small cap)` — never a client-supplied number — so faking a
 * large duration would require literally keeping the app open and pinging
 * for that long, which is exactly the real engagement being measured.
 */
export async function recordStudyHeartbeat(studentId: string, type: StudyActivityType): Promise<HeartbeatResult> {
  const now = new Date();
  const today = startOfDay(now);

  const existing = await prisma.studyActivity.findUnique({
    where: { studentId_type_activityDate: { studentId, type, activityDate: today } },
  });

  const delta = !existing || !existing.lastHeartbeatAt
    ? FIRST_HEARTBEAT_BOOTSTRAP_SECONDS
    : Math.max(0, Math.min(Math.round((now.getTime() - existing.lastHeartbeatAt.getTime()) / 1000), MAX_CREDIT_PER_HEARTBEAT_SECONDS));

  if (delta <= 0) return { creditedSeconds: 0 };

  await recordStudentActivity(studentId, type, delta);
  return { creditedSeconds: delta };
}

export type StudyTimeSummary = {
  todaySeconds: number;
  weekSeconds: number;
  monthSeconds: number;
  byTypeToday: Partial<Record<StudyActivityType, number>>;
};

/** Every number here is a real sum over StudyActivity rows — no placeholder data. */
export async function getStudyTimeSummary(studentId: string): Promise<StudyTimeSummary> {
  const today = startOfDay(new Date());
  const weekStart = addDays(today, -6);
  const monthStart = addDays(today, -29);

  const rows = await prisma.studyActivity.findMany({
    where: { studentId, activityDate: { gte: monthStart } },
    select: { type: true, activityDate: true, durationSeconds: true },
  });

  let todaySeconds = 0;
  let weekSeconds = 0;
  let monthSeconds = 0;
  const byTypeToday: Partial<Record<StudyActivityType, number>> = {};

  for (const row of rows) {
    monthSeconds += row.durationSeconds;
    if (row.activityDate >= weekStart) weekSeconds += row.durationSeconds;
    if (isSameDay(row.activityDate, today)) {
      todaySeconds += row.durationSeconds;
      byTypeToday[row.type] = (byTypeToday[row.type] ?? 0) + row.durationSeconds;
    }
  }

  return { todaySeconds, weekSeconds, monthSeconds, byTypeToday };
}
