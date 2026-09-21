import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { gradeResponses } from "@/lib/exam/grading";
import { getBandForScore } from "@/lib/analytics/band-conversion";
import { recordStudentActivity } from "@/lib/study-activity";

/** Types of tests the Phase 3 exam engine can actually run. */
export const SIMULATABLE_TEST_TYPES = ["READING", "LISTENING"] as const;

/**
 * Resumes the student's in-progress attempt at this test if one exists,
 * otherwise starts a fresh one. Only Reading/Listening tests are
 * simulatable in this phase.
 */
export async function getOrCreateAttempt(studentId: string, mockTestId: string) {
  const mockTest = await prisma.mockTest.findUnique({
    where: { id: mockTestId },
    select: { id: true, type: true, isPublished: true, isArchived: true },
  });

  if (!mockTest || !mockTest.isPublished || mockTest.isArchived) return null;
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
          passages: { orderBy: { orderIndex: "asc" } },
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
          questions: {
            orderBy: { orderIndex: "asc" },
            select: { id: true, prompt: true, type: true, points: true, options: true, correctAnswer: true },
          },
        },
      },
      answers: true,
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
          questions: { select: { id: true, type: true, correctAnswer: true, points: true } },
        },
      },
      answers: { select: { questionId: true, response: true } },
    },
  });
  if (!result) throw new Error("Attempt not found or already submitted.");

  const responses = new Map(result.answers.map((answer) => [answer.questionId, answer.response]));
  const graded = gradeResponses(result.mockTest.questions, responses);
  // Only answered questions have an Answer row to update — unanswered ones
  // correctly contribute 0 points without needing a row at all.
  const gradedAnswered = graded.filter((item) => responses.has(item.questionId));

  const completedAt = new Date();
  const durationSeconds = Math.max(0, Math.round((completedAt.getTime() - result.startedAt.getTime()) / 1000));
  const rawScore = graded.reduce((sum, item) => sum + item.pointsAwarded, 0);

  // Score conversion, not AI: looked up from the test author's own
  // teacher-maintained table. Null when no table/range covers this score —
  // never guessed.
  const bandScore = await getBandForScore(result.skill, rawScore, result.mockTest.createdById);

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

  // Real, already-computed elapsed time feeds the Phase 15 study-time/coin/
  // streak/achievement system — never a fabricated duration. Best-effort:
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
