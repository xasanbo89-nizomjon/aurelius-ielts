import "server-only";

import { prisma } from "@/lib/prisma";
import { getPlatformOverview } from "@/lib/analytics/platform-overview";
import { getIeltsPerformanceOverview } from "@/lib/analytics/ielts-performance";
import { getPremiumAnalytics } from "@/lib/analytics/premium-analytics";
import { getTeacherEffectivenessReport } from "@/lib/analytics/teacher-effectiveness";

export type ReportTable = { headers: string[]; rows: (string | number | null)[][] };

/** Phase 29 — Part 12. Root-only export: one real row per student, platform-wide. */
export async function buildStudentPerformanceReport(): Promise<ReportTable> {
  const students = await prisma.studentProfile.findMany({
    select: {
      id: true,
      createdAt: true,
      targetBandScore: true,
      user: { select: { name: true, email: true } },
      teacher: { select: { user: { select: { name: true, email: true } } } },
      results: { where: { completedAt: { not: null }, bandScore: { not: null } }, select: { bandScore: true } },
      subscriptions: { where: { status: "ACTIVE" }, select: { id: true }, take: 1 },
      studyStreak: { select: { currentStreak: true, longestStreak: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const headers = [
    "Name",
    "Email",
    "Teacher",
    "Joined",
    "Target Band",
    "Tests Completed",
    "Average Band",
    "Premium",
    "Current Streak",
    "Longest Streak",
  ];

  const rows = students.map((s) => {
    const bands = s.results.map((r) => r.bandScore as number);
    const avgBand = bands.length > 0 ? Math.round((bands.reduce((a, b) => a + b, 0) / bands.length) * 10) / 10 : null;
    return [
      s.user.name ?? "",
      s.user.email,
      s.teacher?.user.name ?? s.teacher?.user.email ?? "",
      s.createdAt.toISOString().slice(0, 10),
      s.targetBandScore,
      s.results.length,
      avgBand,
      s.subscriptions.length > 0 ? "Yes" : "No",
      s.studyStreak?.currentStreak ?? 0,
      s.studyStreak?.longestStreak ?? 0,
    ];
  });

  return { headers, rows };
}

/** Phase 29 — Part 12. Root-only export: the same real cross-teacher effectiveness rows shown on /teacher/analytics/teachers. */
export async function buildTeacherPerformanceReport(): Promise<ReportTable> {
  const teachers = await getTeacherEffectivenessReport();

  const headers = [
    "Name",
    "Email",
    "Root Teacher",
    "Students",
    "Avg Student Improvement (band)",
    "Total Assignments",
    "Assignment Completion Rate",
    "Article Views",
    "Vocabulary Lookups",
  ];

  const rows = teachers.map((t) => [
    t.name ?? "",
    t.email,
    t.isRootTeacher ? "Yes" : "No",
    t.studentCount,
    t.avgStudentImprovement,
    t.totalAssignments,
    t.completionRate != null ? `${t.completionRate}%` : null,
    t.articleViews,
    t.vocabularyLookups,
  ]);

  return { headers, rows };
}

/** Phase 29 — Part 12. Root-only export: one KPI-per-row platform summary, combining Parts 1/2/7/8's real numbers. */
export async function buildPlatformReport(): Promise<ReportTable> {
  const [overview, performance, premium] = await Promise.all([
    getPlatformOverview(),
    getIeltsPerformanceOverview(null),
    getPremiumAnalytics(),
  ]);

  const headers = ["Metric", "Value"];
  const rows: (string | number | null)[][] = [
    ["Total Students", overview.totalStudents],
    ["New Students This Week", overview.newStudentsThisWeek],
    ["New Students This Month", overview.newStudentsThisMonth],
    ["Premium Students", overview.premiumStudents],
    ["Free Students", overview.freeStudents],
    ["Daily Active Users", overview.dailyActiveUsers],
    ["Weekly Active Users", overview.weeklyActiveUsers],
    ["Monthly Active Users", overview.monthlyActiveUsers],
    ...performance.skillAverages.map((s): (string | number | null)[] => [`Average ${s.skill} Band`, s.avgBand]),
    ["Overall Average Band", performance.overallAverage],
    ["Active Premium Users", premium.activePremiumUsers],
    ["Expired Premium Users", premium.expiredPremiumUsers],
    ["Legacy Redemption Activations (historical)", premium.coinBasedActivations],
    ["Direct Activations", premium.directActivations],
    ["Telegram Activations", premium.telegramActivations],
  ];

  return { headers, rows };
}
