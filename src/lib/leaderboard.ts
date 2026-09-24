import "server-only";

import { prisma } from "@/lib/prisma";

export type LeaderboardRow = { studentId: string; name: string | null; email: string; value: number };

/**
 * Phase 26 — Student Leaderboard. Scoped to the viewing student's own
 * teacher's roster (same data boundary the teacher's own engagement
 * insights already use) — never cross-teacher, never platform-wide, since a
 * student has no legitimate reason to see another teacher's class.
 */
export async function getCoinLeaderboard(teacherId: string | null, limit = 10): Promise<LeaderboardRow[]> {
  if (!teacherId) return [];
  const students = await prisma.studentProfile.findMany({
    where: { teacherId, coinWallet: { lifetimeEarned: { gt: 0 } } },
    select: { id: true, user: { select: { name: true, email: true } }, coinWallet: { select: { lifetimeEarned: true } } },
    orderBy: { coinWallet: { lifetimeEarned: "desc" } },
    take: limit,
  });
  return students.map((s) => ({ studentId: s.id, name: s.user.name, email: s.user.email, value: s.coinWallet?.lifetimeEarned ?? 0 }));
}

export async function getActivityLeaderboard(teacherId: string | null, limit = 10): Promise<LeaderboardRow[]> {
  if (!teacherId) return [];
  const students = await prisma.studentProfile.findMany({ where: { teacherId }, select: { id: true, user: { select: { name: true, email: true } } } });
  if (students.length === 0) return [];

  const totals = await prisma.studyActivity.groupBy({
    by: ["studentId"],
    where: { studentId: { in: students.map((s) => s.id) } },
    _sum: { durationSeconds: true },
  });

  const studentsById = new Map(students.map((s) => [s.id, s.user]));
  return totals
    .map((t) => {
      const user = studentsById.get(t.studentId);
      return user ? { studentId: t.studentId, name: user.name, email: user.email, value: t._sum.durationSeconds ?? 0 } : null;
    })
    .filter((row): row is LeaderboardRow => row != null && row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export async function getStreakLeaderboard(teacherId: string | null, limit = 10): Promise<LeaderboardRow[]> {
  if (!teacherId) return [];
  const students = await prisma.studentProfile.findMany({
    where: { teacherId, studyStreak: { longestStreak: { gt: 0 } } },
    select: { id: true, user: { select: { name: true, email: true } }, studyStreak: { select: { longestStreak: true } } },
    orderBy: { studyStreak: { longestStreak: "desc" } },
    take: limit,
  });
  return students.map((s) => ({ studentId: s.id, name: s.user.name, email: s.user.email, value: s.studyStreak?.longestStreak ?? 0 }));
}
