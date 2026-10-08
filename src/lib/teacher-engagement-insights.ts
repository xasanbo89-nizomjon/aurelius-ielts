import "server-only";

import { prisma } from "@/lib/prisma";
import { getStudentOverview } from "@/lib/dashboard-data";
import { getPremiumStatusMap } from "@/lib/premium-identity";

const TOP_N = 5;
const MOST_ACTIVE_TABLE_TOP_N = 10;
const ACTIVE_WINDOW_DAYS = 30;

export type RankedStudent = { studentId: string; name: string | null; email: string; value: number };

export type TeacherEngagementInsights = {
  mostActiveStudents: RankedStudent[];
  highestStreaks: RankedStudent[];
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
      goalAchievement: { studentsWithGoal: 0, studentsAtOrAboveTarget: 0, ratePercent: null },
    };
  }

  const activeWindowStart = new Date();
  activeWindowStart.setDate(activeWindowStart.getDate() - ACTIVE_WINDOW_DAYS);
  activeWindowStart.setHours(0, 0, 0, 0);

  const [activityTotals, streaks] = await Promise.all([
    prisma.studyActivity.groupBy({
      by: ["studentId"],
      where: { studentId: { in: studentIds }, activityDate: { gte: activeWindowStart } },
      _sum: { durationSeconds: true },
    }),
    prisma.studyStreak.findMany({ where: { studentId: { in: studentIds } } }),
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

  const studentsWithGoal = students.filter((s) => s.targetBandScore != null);
  let studentsAtOrAboveTarget = 0;
  if (studentsWithGoal.length > 0) {
    const overviews = await Promise.all(studentsWithGoal.map((s) => getStudentOverview(s.id, "teacher")));
    studentsAtOrAboveTarget = overviews.filter(
      (overview, index) => overview.bandScore != null && overview.bandScore >= studentsWithGoal[index].targetBandScore!
    ).length;
  }

  return {
    mostActiveStudents,
    highestStreaks,
    goalAchievement: {
      studentsWithGoal: studentsWithGoal.length,
      studentsAtOrAboveTarget,
      ratePercent: studentsWithGoal.length > 0 ? Math.round((studentsAtOrAboveTarget / studentsWithGoal.length) * 100) : null,
    },
  };
}

export type MostActiveStudentRow = {
  studentId: string;
  name: string | null;
  email: string;
  currentStreak: number;
  longestStreak: number;
  isPremium: boolean;
};

/**
 * Phase 39 — Part 9 (Phase 48 removed the coin balance column). Additive,
 * separate from getTeacherEngagementInsights above (which ranks "most
 * active" by real study SECONDS): this ranks the same student roster by
 * real current STREAK and also surfaces longest streak and premium status
 * in one row, for the dedicated table on the Students page. Same
 * single-tenant `teacherId` scoping as every other teacher analytics
 * function in this file.
 */
export async function getMostActiveStudentsTable(teacherId: string): Promise<MostActiveStudentRow[]> {
  const students = await prisma.studentProfile.findMany({
    where: { teacherId },
    select: { id: true, user: { select: { name: true, email: true } } },
  });
  const studentIds = students.map((s) => s.id);
  if (studentIds.length === 0) return [];

  const [streaks, premiumMap] = await Promise.all([
    prisma.studyStreak.findMany({ where: { studentId: { in: studentIds } } }),
    getPremiumStatusMap(studentIds),
  ]);

  const streakByStudent = new Map(streaks.map((s) => [s.studentId, s]));

  return students
    .map((student) => {
      const streak = streakByStudent.get(student.id);
      return {
        studentId: student.id,
        name: student.user.name,
        email: student.user.email,
        currentStreak: streak?.currentStreak ?? 0,
        longestStreak: streak?.longestStreak ?? 0,
        isPremium: premiumMap.get(student.id) ?? false,
      };
    })
    .sort((a, b) => b.currentStreak - a.currentStreak)
    .slice(0, MOST_ACTIVE_TABLE_TOP_N);
}
