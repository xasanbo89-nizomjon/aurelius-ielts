import "server-only";

import { prisma } from "@/lib/prisma";

const HIGH_STREAK_THRESHOLD = 10;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function avg(values: number[]): number | null {
  return values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
}

export type StreakBandCorrelation = {
  highStreakAvgBand: number | null;
  highStreakSampleSize: number;
  lowStreakAvgBand: number | null;
  lowStreakSampleSize: number;
  delta: number | null;
};

/**
 * Real correlation, not a guess: splits every student with at least one
 * scored Result into two real groups by their actual StudyStreak.
 * longestStreak, then compares real average bands between the groups.
 * Null when either group has no scored results yet — never a fabricated
 * comparison.
 */
export async function getStreakBandCorrelation(teacherId: string | null): Promise<StreakBandCorrelation> {
  const studentWhere = teacherId ? { teacherId } : {};

  const students = await prisma.studentProfile.findMany({
    where: studentWhere,
    select: {
      studyStreak: { select: { longestStreak: true } },
      results: { where: { completedAt: { not: null }, bandScore: { not: null } }, select: { bandScore: true } },
    },
  });

  const highStreakBands: number[] = [];
  const lowStreakBands: number[] = [];
  for (const student of students) {
    const bands = student.results.map((r) => r.bandScore as number);
    if (bands.length === 0) continue;
    const longest = student.studyStreak?.longestStreak ?? 0;
    if (longest >= HIGH_STREAK_THRESHOLD) highStreakBands.push(...bands);
    else lowStreakBands.push(...bands);
  }

  const highStreakAvgBand = avg(highStreakBands);
  const lowStreakAvgBand = avg(lowStreakBands);

  return {
    highStreakAvgBand,
    highStreakSampleSize: highStreakBands.length,
    lowStreakAvgBand,
    lowStreakSampleSize: lowStreakBands.length,
    delta: highStreakAvgBand != null && lowStreakAvgBand != null ? Math.round((highStreakAvgBand - lowStreakAvgBand) * 10) / 10 : null,
  };
}

export type ActivityGrowth = {
  skill: "SPEAKING" | "WRITING" | "READING" | "LISTENING" | "ARTICLE" | "VOCABULARY";
  thisMonthCount: number;
  lastMonthCount: number;
  percentChange: number | null;
};

/** Real month-over-month counts for each real activity source — no estimation, a straight count comparison. */
export async function getActivityGrowth(teacherId: string | null): Promise<ActivityGrowth[]> {
  const studentWhere = teacherId ? { teacherId } : undefined;
  const now = new Date();
  const thisMonthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const lastMonthStart = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  async function countInRange(model: "speakingSubmission" | "writingSubmission" | "articleView", start: Date, end: Date): Promise<number> {
    if (model === "speakingSubmission") {
      return prisma.speakingSubmission.count({ where: { createdAt: { gte: start, lt: end }, ...(studentWhere ? { student: studentWhere } : {}) } });
    }
    if (model === "writingSubmission") {
      return prisma.writingSubmission.count({ where: { createdAt: { gte: start, lt: end }, status: { not: "DRAFT" }, ...(studentWhere ? { student: studentWhere } : {}) } });
    }
    return prisma.articleView.count({ where: { viewedAt: { gte: start, lt: end }, ...(studentWhere ? { student: studentWhere } : {}) } });
  }

  const [speakingThis, speakingLast, writingThis, writingLast, articleThis, articleLast] = await Promise.all([
    countInRange("speakingSubmission", thisMonthStart, now),
    countInRange("speakingSubmission", lastMonthStart, thisMonthStart),
    countInRange("writingSubmission", thisMonthStart, now),
    countInRange("writingSubmission", lastMonthStart, thisMonthStart),
    countInRange("articleView", thisMonthStart, now),
    countInRange("articleView", lastMonthStart, thisMonthStart),
  ]);

  function percentChange(thisCount: number, lastCount: number): number | null {
    if (lastCount === 0) return null;
    return Math.round(((thisCount - lastCount) / lastCount) * 100);
  }

  return [
    { skill: "SPEAKING", thisMonthCount: speakingThis, lastMonthCount: speakingLast, percentChange: percentChange(speakingThis, speakingLast) },
    { skill: "WRITING", thisMonthCount: writingThis, lastMonthCount: writingLast, percentChange: percentChange(writingThis, writingLast) },
    { skill: "ARTICLE", thisMonthCount: articleThis, lastMonthCount: articleLast, percentChange: percentChange(articleThis, articleLast) },
  ];
}
