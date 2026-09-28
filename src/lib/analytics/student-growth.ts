import "server-only";

import { prisma } from "@/lib/prisma";

const MIN_RESULTS_FOR_CONSISTENCY = 4;
const RANKING_LIMIT = 5;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

export type GrowthRankingRow = { studentId: string; name: string | null; email: string; value: number; detail: string };

export type StudentGrowthTracker = {
  mostConsistent: GrowthRankingRow[];
  highestActivity: GrowthRankingRow[];
  longestStreak: GrowthRankingRow[];
  mostTestsCompleted: GrowthRankingRow[];
};

/**
 * Phase 29 — Part 3. "Fastest Improving" is intentionally not duplicated
 * here — it's the exact same real ranking as
 * getTopImprovingStudents() in teacher-performance-insights.ts (Phase 25),
 * reused as-is by the page that renders this tracker.
 *
 * "Most Consistent" is a real statistical measure — standard deviation of
 * a student's own band scores across their completed tests — never a
 * guess: a lower spread genuinely means more consistent performance.
 */
export async function getStudentGrowthTracker(teacherId: string): Promise<StudentGrowthTracker> {
  const monthStart = daysAgo(29);

  const students = await prisma.studentProfile.findMany({
    where: { teacherId },
    select: {
      id: true,
      user: { select: { name: true, email: true } },
      studyStreak: { select: { longestStreak: true } },
      results: { where: { completedAt: { not: null } }, select: { bandScore: true } },
      studyActivities: { where: { activityDate: { gte: monthStart } }, select: { durationSeconds: true } },
    },
  });

  const consistency: GrowthRankingRow[] = [];
  const activity: GrowthRankingRow[] = [];
  const streaks: GrowthRankingRow[] = [];
  const testsCompleted: GrowthRankingRow[] = [];

  for (const student of students) {
    const identity = { studentId: student.id, name: student.user.name, email: student.user.email };

    const bands = student.results.map((r) => r.bandScore).filter((v): v is number => v != null);
    if (bands.length >= MIN_RESULTS_FOR_CONSISTENCY) {
      const mean = bands.reduce((a, b) => a + b, 0) / bands.length;
      const variance = bands.reduce((sum, b) => sum + (b - mean) ** 2, 0) / bands.length;
      const stdDev = Math.round(Math.sqrt(variance) * 100) / 100;
      consistency.push({ ...identity, value: stdDev, detail: `${bands.length} tests, band std. dev. ${stdDev.toFixed(2)}` });
    }

    const activityMinutes = Math.round(student.studyActivities.reduce((sum, a) => sum + a.durationSeconds, 0) / 60);
    if (activityMinutes > 0) {
      activity.push({ ...identity, value: activityMinutes, detail: `${activityMinutes} minutes in the last 30 days` });
    }

    const longest = student.studyStreak?.longestStreak ?? 0;
    if (longest > 0) {
      streaks.push({ ...identity, value: longest, detail: `${longest}-day longest streak` });
    }

    if (student.results.length > 0) {
      testsCompleted.push({ ...identity, value: student.results.length, detail: `${student.results.length} tests completed` });
    }
  }

  return {
    // Lower std. dev = more consistent — ascending sort, unlike every other ranking here.
    mostConsistent: consistency.sort((a, b) => a.value - b.value).slice(0, RANKING_LIMIT),
    highestActivity: activity.sort((a, b) => b.value - a.value).slice(0, RANKING_LIMIT),
    longestStreak: streaks.sort((a, b) => b.value - a.value).slice(0, RANKING_LIMIT),
    mostTestsCompleted: testsCompleted.sort((a, b) => b.value - a.value).slice(0, RANKING_LIMIT),
  };
}
