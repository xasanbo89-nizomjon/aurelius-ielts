import "server-only";

import { prisma } from "@/lib/prisma";

const MIN_RESULTS_FOR_IMPROVEMENT = 4;

function avg(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export type TeacherEffectivenessRow = {
  teacherId: string;
  name: string | null;
  email: string;
  isRootTeacher: boolean;
  studentCount: number;
  avgStudentImprovement: number | null;
  studentsWithImprovementData: number;
  totalAssignments: number;
  completionRate: number | null;
  articleViews: number;
  vocabularyLookups: number;
};

/**
 * Phase 29 — Part 5, Teacher Effectiveness (root-only, cross-teacher).
 * "Average student improvement" is the mean of each of this teacher's own
 * students' real recent-vs-earlier band deltas (same recent-2-vs-earlier-2
 * window as getTopImprovingStudents) — only students with enough completed
 * tests contribute, so a teacher with mostly new students isn't penalized
 * with a fabricated low score, just an honest smaller sample.
 */
export async function getTeacherEffectivenessReport(): Promise<TeacherEffectivenessRow[]> {
  const teachers = await prisma.teacherProfile.findMany({
    select: {
      id: true,
      isRootTeacher: true,
      user: { select: { name: true, email: true } },
      students: {
        select: {
          results: {
            where: { completedAt: { not: null }, bandScore: { not: null } },
            orderBy: { completedAt: "desc" },
            take: 4,
            select: { bandScore: true },
          },
        },
      },
      assignments: { select: { status: true } },
      articles: { select: { _count: { select: { views: true, vocabularyLookups: true } } } },
    },
  });

  return teachers
    .map((teacher) => {
      const deltas: number[] = [];
      for (const student of teacher.students) {
        const bands = student.results.map((r) => r.bandScore as number);
        if (bands.length < MIN_RESULTS_FOR_IMPROVEMENT) continue;
        const recentAvg = avg(bands.slice(0, 2))!;
        const earlierAvg = avg(bands.slice(2, 4))!;
        deltas.push(recentAvg - earlierAvg);
      }

      const completed = teacher.assignments.filter((a) => a.status === "COMPLETED").length;
      const articleViews = teacher.articles.reduce((sum, a) => sum + a._count.views, 0);
      const vocabularyLookups = teacher.articles.reduce((sum, a) => sum + a._count.vocabularyLookups, 0);

      return {
        teacherId: teacher.id,
        name: teacher.user.name,
        email: teacher.user.email,
        isRootTeacher: teacher.isRootTeacher,
        studentCount: teacher.students.length,
        avgStudentImprovement: deltas.length > 0 ? Math.round((avg(deltas) as number) * 100) / 100 : null,
        studentsWithImprovementData: deltas.length,
        totalAssignments: teacher.assignments.length,
        completionRate: teacher.assignments.length > 0 ? Math.round((completed / teacher.assignments.length) * 100) : null,
        articleViews,
        vocabularyLookups,
      };
    })
    .sort((a, b) => b.studentCount - a.studentCount);
}
