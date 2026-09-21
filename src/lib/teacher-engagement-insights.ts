import "server-only";

import { prisma } from "@/lib/prisma";
import { getStudentOverview } from "@/lib/dashboard-data";

const TOP_N = 5;
const ACTIVE_WINDOW_DAYS = 30;

export type RankedStudent = { studentId: string; name: string | null; email: string; value: number };

export type TeacherEngagementInsights = {
  mostActiveStudents: RankedStudent[];
  highestStreaks: RankedStudent[];
  mostCoinsEarned: RankedStudent[];
  goalAchievement: { studentsWithGoal: number; studentsAtOrAboveTarget: number; ratePercent: number | null };
};

function toRanked(
  rows: { studentId: string; value: number }[],
  studentsById: Map<string, { name: string | null; email: string }>
): RankedStudent[] {
  return rows
    .map((row) => {
      const student = studentsById.get(row.studentId);
      return student ? { studentId: row.studentId, name: student.name, email: student.email, value: row.value } : null;
    })
    .filter((row): row is RankedStudent => row !== null);
}

/**
 * Root Teacher Insights (Phase 15, section 11) — every number is a real
 * aggregate over this teacher's own students only, same single-tenant
 * scoping (`student.teacherId`) as every other teacher-facing analytics
 * function in this codebase.
 */
export async function getTeacherEngagementInsights(teacherId: string): Promise<TeacherEngagementInsights> {
  const students = await prisma.studentProfile.findMany({
    where: { teacherId },
    select: { id: true, targetBandScore: true, user: { select: { name: true, email: true } } },
  });
  const studentIds = students.map((s) => s.id);
  const studentsById = new Map(students.map((s) => [s.id, { name: s.user.name, email: s.user.email }]));

  if (studentIds.length === 0) {
    return {
      mostActiveStudents: [],
      highestStreaks: [],
      mostCoinsEarned: [],
      goalAchievement: { studentsWithGoal: 0, studentsAtOrAboveTarget: 0, ratePercent: null },
    };
  }

  const activeWindowStart = new Date();
  activeWindowStart.setDate(activeWindowStart.getDate() - ACTIVE_WINDOW_DAYS);
  activeWindowStart.setHours(0, 0, 0, 0);

  const [activityTotals, streaks, wallets] = await Promise.all([
    prisma.studyActivity.groupBy({
      by: ["studentId"],
      where: { studentId: { in: studentIds }, activityDate: { gte: activeWindowStart } },
      _sum: { durationSeconds: true },
    }),
    prisma.studyStreak.findMany({ where: { studentId: { in: studentIds } } }),
    prisma.coinWallet.findMany({ where: { studentId: { in: studentIds } } }),
  ]);

  const mostActiveStudents = toRanked(
    activityTotals
      .map((row) => ({ studentId: row.studentId, value: row._sum.durationSeconds ?? 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_N),
    studentsById
  );

  const highestStreaks = toRanked(
    streaks
      .map((row) => ({ studentId: row.studentId, value: row.currentStreak }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_N),
    studentsById
  );

  const mostCoinsEarned = toRanked(
    wallets
      .map((row) => ({ studentId: row.studentId, value: row.lifetimeEarned }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_N),
    studentsById
  );

  const studentsWithGoal = students.filter((s) => s.targetBandScore != null);
  let studentsAtOrAboveTarget = 0;
  if (studentsWithGoal.length > 0) {
    const overviews = await Promise.all(studentsWithGoal.map((s) => getStudentOverview(s.id)));
    studentsAtOrAboveTarget = overviews.filter(
      (overview, index) => overview.bandScore != null && overview.bandScore >= studentsWithGoal[index].targetBandScore!
    ).length;
  }

  return {
    mostActiveStudents,
    highestStreaks,
    mostCoinsEarned,
    goalAchievement: {
      studentsWithGoal: studentsWithGoal.length,
      studentsAtOrAboveTarget,
      ratePercent: studentsWithGoal.length > 0 ? Math.round((studentsAtOrAboveTarget / studentsWithGoal.length) * 100) : null,
    },
  };
}
