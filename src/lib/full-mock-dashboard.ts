import "server-only";
import type { MockTestCategory, MockTestDifficulty } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { hasActiveAccess } from "@/lib/subscription";
import { withoutInternalTests } from "@/lib/test-visibility";
import {
  FULL_MOCK_LISTENING_MINUTES,
  FULL_MOCK_LISTENING_TRANSFER_MINUTES,
  FULL_MOCK_READING_MINUTES,
  FULL_MOCK_SPEAKING_MINUTES,
  FULL_MOCK_WRITING_MINUTES,
} from "@/lib/full-mock-constants";

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
  latestCompletedAt: Date | null;
};

/**
 * Phase O - what the STUDENT's Mock Exams page is made of. A Full Mock's bands are for teachers only, so nothing here carries a band, an Overall or a trend: the student
 * sees which mocks they can start, which are in progress and which they have handed in.
 */
export type FullMockDashboard = {
  available: FullMockCardData[];
  inProgress: FullMockCardData[];
  completed: FullMockCardData[];
  premiumLocked: FullMockCardData[];
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
      // Phase O - a mock archived while the student is in the middle of it stays on their page until they finish (only one Full Mock is active at a time).
      where: { OR: [{ status: "PUBLISHED" }, { status: "ARCHIVED", attempts: { some: { studentId, status: "IN_PROGRESS" } } }] },
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
      select: { id: true, fullMockTestId: true, status: true, completedAt: true },
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

  for (const test of withoutInternalTests(tests)) {
    // Inside a Full Mock every section runs on the real IELTS clock, whatever length the standalone paper was saved with.
    const readingMinutes = test.readingSections.length > 0 ? FULL_MOCK_READING_MINUTES : 0;
    const listeningMinutes = test.listeningSections.length > 0 ? FULL_MOCK_LISTENING_MINUTES + FULL_MOCK_LISTENING_TRANSFER_MINUTES : 0;
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
      latestCompletedAt: latest?.status === "COMPLETED" ? latest.completedAt : null,
    };

    if (latest?.status === "COMPLETED") completed.push(card);
    else if (latest?.status === "IN_PROGRESS") inProgress.push(card);
    else if (locked) premiumLocked.push(card);
    else available.push(card);
  }

  return { available, inProgress, completed, premiumLocked };
}
