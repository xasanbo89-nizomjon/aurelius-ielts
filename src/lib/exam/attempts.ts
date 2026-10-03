import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { gradeResponses } from "@/lib/exam/grading";
import { resolveBandForScore } from "@/lib/analytics/band-conversion";
import { recordStudentActivity } from "@/lib/study-activity";
import { allowedSecondsFor, timeUsedSeconds } from "@/lib/exam/timing";

/** Types of tests the Phase 3 exam engine can actually run. */
export const SIMULATABLE_TEST_TYPES = ["READING", "LISTENING"] as const;

/**
 * Resumes the student's in-progress attempt at this test if one exists,
 * otherwise starts a fresh one. Only Reading/Listening tests are
 * simulatable in this phase.
 */
export async function getOrCreateAttempt(studentId: string, mockTestId: string, options: { viaFullMock?: boolean } = {}) {
  const mockTest = await prisma.mockTest.findUnique({
    where: { id: mockTestId },
    select: { id: true, type: true, isPublished: true, isArchived: true, packageFullMockTestId: true },
  });

  if (!mockTest || !mockTest.isPublished || mockTest.isArchived) return null;
  // A test built for a Full Mock package can only be sat through that mock (and so through its access code) — never started on its own.
  if (mockTest.packageFullMockTestId && !options.viaFullMock) return null;
  if (!SIMULATABLE_TEST_TYPES.includes(mockTest.type as (typeof SIMULATABLE_TEST_TYPES)[number])) {
    return null;
  }

  const existing = await prisma.result.findFirst({
    where: { studentId, mockTestId, completedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (existing) return existing;

  return prisma.result.create({
    data: {
      studentId,
      mockTestId,
      skill: mockTest.type === "LISTENING" ? "LISTENING" : "READING",
    },
  });
}

/** Full attempt state needed to render the exam UI, scoped to its owner. */
export async function getAttemptDetail(resultId: string, studentId: string) {
  const result = await prisma.result.findFirst({
    where: { id: resultId, studentId },
    include: {
      mockTest: {
        include: {
          passages: {
            orderBy: { orderIndex: "asc" },
            include: { attachments: { orderBy: { orderIndex: "asc" } } },
          },
          questions: { orderBy: { orderIndex: "asc" } },
        },
      },
      answers: true,
      highlights: true,
      notes: true,
    },
  });

  return result;
}

/**
 * Post-submission review data: every question in the test (so unanswered
 * ones still show up), joined against whatever the student actually
 * answered. Scoped to its owner.
 */
export async function getAttemptSummary(resultId: string, studentId: string) {
  return prisma.result.findFirst({
    where: { id: resultId, studentId },
    include: {
      mockTest: {
        select: {
          id: true,
          title: true,
          type: true,
          // Phase 44 — Part 2's per-passage/part breakdown, extended Phase 46
          // for the real split-screen review (passage text / real Listening
          // transcript via the same `content` field, plus real audio path).
          passages: {
            orderBy: { orderIndex: "asc" },
            select: {
              id: true,
              title: true,
              content: true,
              audioPath: true,
              audioUrl: true,
              orderIndex: true,
              attachments: { orderBy: { orderIndex: "asc" } },
            },
          },
          questions: {
            orderBy: { orderIndex: "asc" },
            select: { id: true, passageId: true, prompt: true, type: true, points: true, options: true, correctAnswer: true },
          },
        },
      },
      answers: true,
      // Phase 46 — the student's own real highlights from when they took the
      // exam, shown (never editable) in the read-only review passage panel.
      highlights: true,
    },
  });
}

export async function saveAnswer(
  resultId: string,
  studentId: string,
  questionId: string,
  response: Prisma.InputJsonValue
) {
  const result = await prisma.result.findFirst({
    where: { id: resultId, studentId, completedAt: null },
    select: { id: true },
  });
  if (!result) throw new Error("Attempt not found or already submitted.");

  return prisma.answer.upsert({
    where: { resultId_questionId: { resultId, questionId } },
    create: { resultId, questionId, response },
    update: { response },
  });
}

/**
 * Phase 41 — Part 14/15's real "return to exactly where I was" recovery.
 * Best-effort by design (called on every question navigation, debounced
 * client-side): silently ignored once the attempt is already submitted,
 * since there's nothing left to resume.
 */
export async function updateLastSeenQuestion(resultId: string, studentId: string, questionId: string): Promise<void> {
  await prisma.result.updateMany({
    where: { id: resultId, studentId, completedAt: null },
    data: { lastSeenQuestionId: questionId },
  });
}

export async function toggleFlag(resultId: string, studentId: string, questionId: string) {
  const result = await prisma.result.findFirst({
    where: { id: resultId, studentId, completedAt: null },
    select: { id: true, flaggedQuestionIds: true },
  });
  if (!result) throw new Error("Attempt not found or already submitted.");

  const current = Array.isArray(result.flaggedQuestionIds) ? (result.flaggedQuestionIds as string[]) : [];
  const next = current.includes(questionId)
    ? current.filter((id) => id !== questionId)
    : [...current, questionId];

  await prisma.result.update({
    where: { id: resultId },
    data: { flaggedQuestionIds: next },
  });

  return next;
}

export async function submitAttempt(resultId: string, studentId: string) {
  const result = await prisma.result.findFirst({
    where: { id: resultId, studentId, completedAt: null },
    include: {
      mockTest: {
        select: {
          createdById: true,
          durationMinutes: true,
          questions: { select: { id: true, type: true, correctAnswer: true, points: true } },
        },
      },
      answers: { select: { questionId: true, response: true } },
      fullMockSectionResult: { select: { section: true } },
    },
  });
  if (!result) throw new Error("Attempt not found or already submitted.");

  const responses = new Map(result.answers.map((answer) => [answer.questionId, answer.response]));
  const graded = gradeResponses(result.mockTest.questions, responses);
  // Only answered questions have an Answer row to update — unanswered ones
  // correctly contribute 0 points without needing a row at all.
  const gradedAnswered = graded.filter((item) => responses.has(item.questionId));

  const completedAt = new Date();
  // Time used = the real elapsed time, but never more than the test allows: an attempt left open for 109 minutes on a 60-minute test used 60.
  const allowedSeconds = allowedSecondsFor({ durationMinutes: result.mockTest.durationMinutes, fullMockSection: result.fullMockSectionResult?.section });
  const durationSeconds = timeUsedSeconds({ startedAt: result.startedAt, endedAt: completedAt, allowedSeconds });
  const rawScore = graded.reduce((sum, item) => sum + item.pointsAwarded, 0);

  // Score conversion, not AI: the test author's own table when they have set
  // one that covers the score, otherwise the official IELTS conversion (scaled
  // onto the 40-mark table when the paper isn't worth 40). Never guessed.
  const totalPoints = result.mockTest.questions.reduce((sum, question) => sum + question.points, 0);
  const bandScore = await resolveBandForScore(result.skill, rawScore, totalPoints, result.mockTest.createdById);

  await prisma.$transaction([
    ...gradedAnswered.map((item) =>
      prisma.answer.update({
        where: { resultId_questionId: { resultId, questionId: item.questionId } },
        data: { isCorrect: item.isCorrect, pointsAwarded: item.pointsAwarded },
      })
    ),
    prisma.result.update({
      where: { id: resultId },
      data: { completedAt, durationSeconds, rawScore, bandScore },
    }),
  ]);

  // Real, already-computed elapsed time feeds the study-time/streak/
  // achievement system — never a fabricated duration. Best-effort:
  // gamification side-effects must never fail a real exam submission.
  if (result.skill === "READING" || result.skill === "LISTENING") {
    try {
      await recordStudentActivity(studentId, result.skill, durationSeconds);
    } catch (error) {
      console.error("[study-activity] failed to record exam attempt activity:", error);
    }
  }

  return { resultId, rawScore, durationSeconds, bandScore };
}
