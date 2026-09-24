import "server-only";

import { prisma } from "@/lib/prisma";
import { getResultCards, summarizeResultCards } from "@/lib/analytics/student-insights";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function avg(values: number[]): number | null {
  return values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
}

export type ProgressWindow = { currentAvg: number | null; priorAvg: number | null; delta: number | null };
export type ProgressTrend = "IMPROVING" | "DECLINING" | "STABLE" | "NOT_ENOUGH_DATA";

export type StudentSuccessSummary = {
  currentEstimate: number | null;
  targetBand: number | null;
  gap: number | null;
  testsCompleted: number;
  weeklyProgress: ProgressWindow;
  monthlyProgress: ProgressWindow;
  trend: ProgressTrend;
  /** 0-100, null if no target is set or no real result exists yet to measure from. */
  goalProgressPercent: number | null;
  /** Only set when there's a genuine positive monthly trend to project from — never a guessed date. */
  estimatedCompletionDate: Date | null;
};

function windowProgress(bandsWithDates: { bandScore: number; completedAt: Date }[], windowDays: number): ProgressWindow {
  const currentStart = daysAgo(windowDays);
  const priorStart = daysAgo(windowDays * 2);

  const current = bandsWithDates.filter((r) => r.completedAt >= currentStart).map((r) => r.bandScore);
  const prior = bandsWithDates.filter((r) => r.completedAt >= priorStart && r.completedAt < currentStart).map((r) => r.bandScore);

  const currentAvg = avg(current);
  const priorAvg = avg(prior);
  const delta = currentAvg != null && priorAvg != null ? Math.round((currentAvg - priorAvg) * 10) / 10 : null;

  return { currentAvg, priorAvg, delta };
}

/**
 * Phase 25 — Student Success Center. Every number here is a real aggregate
 * over this student's own completed, banded results — "estimated
 * completion" is the one place this ever projects forward, and only when a
 * genuine positive monthly trend exists to extrapolate from (never a guess
 * dressed up as a date).
 */
export async function getStudentSuccessSummary(studentId: string): Promise<StudentSuccessSummary> {
  const [cards, profile] = await Promise.all([
    getResultCards(studentId),
    prisma.studentProfile.findUnique({ where: { id: studentId }, select: { targetBandScore: true, createdAt: true } }),
  ]);

  const overview = summarizeResultCards(cards);
  const targetBand = profile?.targetBandScore ?? null;
  const currentEstimate = overview.avgBand;
  const gap = currentEstimate != null && targetBand != null ? Math.round((targetBand - currentEstimate) * 10) / 10 : null;

  const bandedResults = cards
    .filter((c): c is typeof c & { bandScore: number } => c.bandScore != null)
    .map((c) => ({ bandScore: c.bandScore, completedAt: c.completedAt }))
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

  const weeklyProgress = windowProgress(bandedResults, 7);
  const monthlyProgress = windowProgress(bandedResults, 30);

  let trend: ProgressTrend = "NOT_ENOUGH_DATA";
  if (monthlyProgress.delta != null) {
    trend = monthlyProgress.delta > 0.15 ? "IMPROVING" : monthlyProgress.delta < -0.15 ? "DECLINING" : "STABLE";
  }

  let goalProgressPercent: number | null = null;
  if (targetBand != null && bandedResults.length > 0) {
    const startingBand = bandedResults[0].bandScore;
    if (currentEstimate != null) {
      if (targetBand <= startingBand) {
        goalProgressPercent = currentEstimate >= targetBand ? 100 : 0;
      } else {
        const raw = ((currentEstimate - startingBand) / (targetBand - startingBand)) * 100;
        goalProgressPercent = Math.max(0, Math.min(100, Math.round(raw)));
      }
    }
  }

  let estimatedCompletionDate: Date | null = null;
  if (targetBand != null && gap != null && gap > 0 && monthlyProgress.delta != null && monthlyProgress.delta > 0) {
    const monthsNeeded = gap / monthlyProgress.delta;
    if (monthsNeeded > 0 && monthsNeeded <= 36) {
      const eta = new Date();
      eta.setMonth(eta.getMonth() + Math.ceil(monthsNeeded));
      estimatedCompletionDate = eta;
    }
  }

  return {
    currentEstimate,
    targetBand,
    gap,
    testsCompleted: overview.testsCompleted,
    weeklyProgress,
    monthlyProgress,
    trend,
    goalProgressPercent,
    estimatedCompletionDate,
  };
}
