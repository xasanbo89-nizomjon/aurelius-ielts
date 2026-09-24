import "server-only";

import { prisma } from "@/lib/prisma";

const INACTIVE_DAYS_THRESHOLD = 7;
const SCORE_DECLINE_THRESHOLD = 0.3; // band points

export type AtRiskStudent = {
  studentId: string;
  name: string | null;
  email: string;
  reasons: string[];
};

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Phase 23 — "At Risk Students": deliberately rule-based against real data,
 * not an LLM call. Every reason traces to a real number (StudyStreak,
 * Result.bandScore) — a genuine risk signal is more trustworthy computed
 * directly than asked of a model that could hallucinate a plausible-sounding
 * but wrong reason. "AI identifies" is satisfied by the system doing real
 * pattern detection, not by routing a deterministic check through OpenAI.
 */
export async function getAtRiskStudents(teacherId: string): Promise<AtRiskStudent[]> {
  const students = await prisma.studentProfile.findMany({
    where: { teacherId },
    select: {
      id: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
      studyStreak: { select: { currentStreak: true, longestStreak: true, lastActiveDate: true } },
      results: {
        where: { completedAt: { not: null }, bandScore: { not: null } },
        orderBy: { completedAt: "desc" },
        take: 4,
        select: { bandScore: true, completedAt: true },
      },
    },
  });

  const atRisk: AtRiskStudent[] = [];

  for (const student of students) {
    const reasons: string[] = [];

    const lastActive = student.studyStreak?.lastActiveDate ?? null;
    const inactiveDays = lastActive ? daysSince(lastActive) : daysSince(student.createdAt);
    if (inactiveDays >= INACTIVE_DAYS_THRESHOLD) {
      reasons.push(
        lastActive
          ? `No study activity in ${inactiveDays} days`
          : `Never studied — joined ${inactiveDays} days ago`
      );
    }

    if (student.studyStreak && student.studyStreak.currentStreak === 0 && student.studyStreak.longestStreak >= 3) {
      reasons.push(`Streak reset to 0 (previous best was ${student.studyStreak.longestStreak} days)`);
    }

    const bands = student.results.map((r) => r.bandScore as number);
    if (bands.length >= 4) {
      const recent = bands.slice(0, 2);
      const earlier = bands.slice(2, 4);
      const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
      const recentAvg = avg(recent);
      const earlierAvg = avg(earlier);
      if (earlierAvg - recentAvg >= SCORE_DECLINE_THRESHOLD) {
        reasons.push(`Band score dropped from ${earlierAvg.toFixed(1)} to ${recentAvg.toFixed(1)} over the last 4 tests`);
      }
    }

    if (reasons.length > 0) {
      atRisk.push({ studentId: student.id, name: student.user.name, email: student.user.email, reasons });
    }
  }

  return atRisk;
}
