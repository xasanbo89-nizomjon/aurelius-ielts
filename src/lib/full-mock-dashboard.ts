import "server-only";
import type { MockTestCategory, MockTestDifficulty } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { hasActiveAccess } from "@/lib/subscription";
import { overallBandFromSections, requiredSectionsFor } from "@/lib/full-mock-band-composition";
import { FULL_MOCK_SPEAKING_MINUTES, FULL_MOCK_WRITING_MINUTES } from "@/lib/full-mock-constants";

export type FullMockCardData = {
  id: string;
  title: string;
  description: string | null;
  examNumber: number | null;
  difficulty: MockTestDifficulty | null;
  category: MockTestCategory;
  estimatedBandMin: number | null;
  estimatedBandMax: number | null;
  totalDurationMinutes: number;
  sections: { listening: boolean; reading: boolean; writing: boolean; speaking: boolean };
  locked: boolean;
  latestAttemptId: string | null;
  latestOverallBand: number | null;
  latestCompletedAt: Date | null;
};

export type FullMockHistoryPoint = { attemptId: string; testTitle: string; completedAt: Date; overallBand: number | null };

export type FullMockDashboard = {
  available: FullMockCardData[];
  inProgress: FullMockCardData[];
  completed: FullMockCardData[];
  premiumLocked: FullMockCardData[];
  history: FullMockHistoryPoint[];
  bandTrend: { firstBand: number; latestBand: number; delta: number } | null;
};

/**
 * Phase 47 — the real "Student > Mock Exams" dashboard query. Buckets are
 * derived purely from each test's real PUBLISHED status, the student's own
 * real FullMockAttempt rows, and their real current subscription access —
 * nothing here is scheduled/invented: "Upcoming" means a real attempt
 * that's genuinely IN_PROGRESS (continue where you left off), not a
 * fabricated calendar concept that doesn't exist anywhere in this schema.
 * Bucket priority when a test could fit more than one: a real completed
 * attempt always wins (history is never hidden just because access later
 * lapsed), then in-progress, then premium-lock, then available.
 */
export async function getStudentFullMockDashboard(studentId: string): Promise<FullMockDashboard> {
  const [tests, hasAccess, myAttempts] = await Promise.all([
    prisma.fullMockTest.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      include: {
        readingSections: { include: { mockTest: { select: { durationMinutes: true } } } },
        listeningSections: { include: { mockTest: { select: { durationMinutes: true } } } },
        writingSections: { select: { id: true } },
        speakingSections: { select: { id: true } },
      },
    }),
    hasActiveAccess(studentId),
    prisma.fullMockAttempt.findMany({
      where: { studentId },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        fullMockTestId: true,
        status: true,
        completedAt: true,
        fullMockTest: { select: { title: true, _count: { select: { writingSections: true, speakingSections: true } } } },
        sectionResults: {
          select: {
            section: true,
            result: { select: { bandScore: true } },
            writingSubmission: { select: { bandScore: true } },
            speakingSubmission: { select: { bandScore: true } },
          },
        },
      },
    }),
  ]);

  const latestAttemptByTest = new Map<string, (typeof myAttempts)[number]>();
  for (const attempt of myAttempts) {
    if (!latestAttemptByTest.has(attempt.fullMockTestId)) latestAttemptByTest.set(attempt.fullMockTestId, attempt);
  }

  const available: FullMockCardData[] = [];
  const inProgress: FullMockCardData[] = [];
  const completed: FullMockCardData[] = [];
  const premiumLocked: FullMockCardData[] = [];

  for (const test of tests) {
    const readingMinutes = test.readingSections.reduce((sum, s) => sum + (s.mockTest.durationMinutes ?? 0), 0);
    const listeningMinutes = test.listeningSections.reduce((sum, s) => sum + (s.mockTest.durationMinutes ?? 0), 0);
    const hasWriting = test.writingSections.length > 0;
    const hasSpeaking = test.speakingSections.length > 0;
    const locked = test.category === "GENERAL" && !hasAccess;
    const latest = latestAttemptByTest.get(test.id) ?? null;

    const card: FullMockCardData = {
      id: test.id,
      title: test.title,
      description: test.description,
      examNumber: test.examNumber,
      difficulty: test.difficulty,
      category: test.category,
      estimatedBandMin: test.estimatedBandMin,
      estimatedBandMax: test.estimatedBandMax,
      totalDurationMinutes:
        readingMinutes + listeningMinutes + (hasWriting ? FULL_MOCK_WRITING_MINUTES : 0) + (hasSpeaking ? FULL_MOCK_SPEAKING_MINUTES : 0),
      sections: {
        listening: test.listeningSections.length > 0,
        reading: test.readingSections.length > 0,
        writing: hasWriting,
        speaking: hasSpeaking,
      },
      locked,
      latestAttemptId: latest?.id ?? null,
      latestOverallBand:
        latest?.status === "COMPLETED"
          ? overallBandFromSections(latest.sectionResults, requiredSectionsFor({ writingSectionCount: test.writingSections.length, speakingSectionCount: test.speakingSections.length }))
          : null,
      latestCompletedAt: latest?.status === "COMPLETED" ? latest.completedAt : null,
    };

    if (latest?.status === "COMPLETED") completed.push(card);
    else if (latest?.status === "IN_PROGRESS") inProgress.push(card);
    else if (locked) premiumLocked.push(card);
    else available.push(card);
  }

  const history: FullMockHistoryPoint[] = myAttempts
    .filter((a) => a.status === "COMPLETED" && a.completedAt)
    .map((a) => ({ attemptId: a.id, testTitle: a.fullMockTest.title, completedAt: a.completedAt as Date, overallBand: overallBandFromSections(
        a.sectionResults,
        requiredSectionsFor({ writingSectionCount: a.fullMockTest._count.writingSections, speakingSectionCount: a.fullMockTest._count.speakingSections })
      ),
    }))
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

  const bandedHistory = history.filter((h): h is FullMockHistoryPoint & { overallBand: number } => h.overallBand != null);
  const bandTrend =
    bandedHistory.length >= 2
      ? {
          firstBand: bandedHistory[0].overallBand,
          latestBand: bandedHistory[bandedHistory.length - 1].overallBand,
          delta: Math.round((bandedHistory[bandedHistory.length - 1].overallBand - bandedHistory[0].overallBand) * 10) / 10,
        }
      : null;

  return { available, inProgress, completed, premiumLocked, history, bandTrend };
}
