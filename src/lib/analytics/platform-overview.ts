import "server-only";

import { prisma } from "@/lib/prisma";
import { measureAsync } from "@/lib/monitoring/metrics-store";

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysAgo(n: number): Date {
  return startOfDay(new Date(Date.now() - n * 24 * 60 * 60 * 1000));
}

export type PlatformOverview = {
  totalStudents: number;
  newStudentsThisWeek: number;
  newStudentsThisMonth: number;
  premiumStudents: number;
  freeStudents: number;
  activeStudents: number;
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
};

/**
 * Phase 29 — Platform Overview (root-only). "Active" is measured the same
 * way the coin/streak system already measures real engagement: a real
 * StudyActivity heartbeat row (READING/LISTENING/VOCABULARY/WRITING/
 * ARTICLE practice), which every practice page already pings — not a login
 * or a page view. "Active Students" reuses the 30-day (MAU) window, the
 * standard "currently active" definition alongside DAU/WAU for the same
 * window. Every number is a real, distinct-studentId count — never
 * estimated.
 */
export async function getPlatformOverview(): Promise<PlatformOverview> {
  const now = new Date();
  const weekStart = daysAgo(6);
  const monthStart = daysAgo(29);

  const [totalStudents, newThisWeek, newThisMonth, premiumStudentIds, dau, wau, mau] = await measureAsync("db:platform-overview", () =>
    Promise.all([
      prisma.studentProfile.count(),
      prisma.studentProfile.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.studentProfile.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.subscription.findMany({ where: { status: "ACTIVE" }, select: { studentId: true }, distinct: ["studentId"] }),
      prisma.studyActivity.findMany({ where: { activityDate: { gte: startOfDay(now) } }, select: { studentId: true }, distinct: ["studentId"] }),
      prisma.studyActivity.findMany({ where: { activityDate: { gte: weekStart } }, select: { studentId: true }, distinct: ["studentId"] }),
      prisma.studyActivity.findMany({ where: { activityDate: { gte: monthStart } }, select: { studentId: true }, distinct: ["studentId"] }),
    ])
  );

  const premiumStudents = premiumStudentIds.length;

  return {
    totalStudents,
    newStudentsThisWeek: newThisWeek,
    newStudentsThisMonth: newThisMonth,
    premiumStudents,
    freeStudents: Math.max(0, totalStudents - premiumStudents),
    activeStudents: mau.length,
    dailyActiveUsers: dau.length,
    weeklyActiveUsers: wau.length,
    monthlyActiveUsers: mau.length,
  };
}
