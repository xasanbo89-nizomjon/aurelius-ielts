import type { QuestionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { QUESTION_TYPE_META, QUESTION_TYPE_ORDER } from "@/lib/exam/question-types";
import { summarizeAttemptSlots } from "@/lib/exam/question-numbering";

export type WeakArea = { type: QuestionType; label: string; correct: number; total: number; accuracy: number };

/** Phase 44 — Part 4's full per-type breakdown, every real type that appeared in this attempt (not just the weak ones), including questions the student never answered (counted as wrong, never silently dropped). */
export type QuestionTypeStat = { type: QuestionType; label: string; correct: number; wrong: number; total: number; accuracy: number };

/** Phase 44 — Part 2's real per-passage/part breakdown ("Part 1", "Part 2", ...). */
export type PartBreakdown = { passageId: string | null; label: string; correct: number; total: number };

/** Phase 44 — Part 3's real accuracy/time/answered/skipped block. */
export type AccuracyStats = {
  accuracyPercent: number | null;
  answered: number;
  skipped: number;
  total: number;
  timeUsedSeconds: number | null;
};

export type ResultInsights = {
  weakAreas: WeakArea[];
  /** Phase 44 — Part 5's symmetric "Strong Areas" (accuracy at or above the real top band among this attempt's own types, never a fabricated universal threshold). */
  strongAreas: WeakArea[];
  questionTypeBreakdown: QuestionTypeStat[];
  partBreakdown: PartBreakdown[];
  accuracy: AccuracyStats;
  recommendedPracticeHref: string | null;
  recommendationText: string | null;
};

/**
 * Phase 35 — Part 11 (extended Phase 44). Real per-question-type accuracy
 * for THIS attempt only (never a fabricated "typical weakness") — every
 * real question in the test counts, including ones the student never
 * answered (0 credit, still counted toward that type's total), so accuracy
 * is never inflated by silently excluding skipped questions.
 */
export async function getResultInsights(resultId: string, studentId: string): Promise<ResultInsights | null> {
  const result = await prisma.result.findFirst({
    where: { id: resultId, studentId, completedAt: { not: null } },
    select: {
      skill: true,
      startedAt: true,
      completedAt: true,
      durationSeconds: true,
      mockTest: {
        select: {
          passages: { orderBy: { orderIndex: "asc" }, select: { id: true, title: true, orderIndex: true } },
          questions: { orderBy: { orderIndex: "asc" }, select: { id: true, type: true, passageId: true, options: true, correctAnswer: true } },
        },
      },
      answers: { select: { questionId: true, isCorrect: true, response: true } },
    },
  });
  if (!result) return null;

  // Phase A — every figure below counts NUMBERED questions (a matching / summary row covers several), so "x / 40" here matches what the student saw while taking the test and what the teacher's import review showed.
  const { rows, totals } = summarizeAttemptSlots(
    result.mockTest.questions,
    new Map(result.answers.map((a) => [a.questionId, a.response])),
    new Map(result.answers.map((a) => [a.questionId, a.isCorrect]))
  );

  const byType = new Map<QuestionType, { correct: number; total: number }>();
  const byPassage = new Map<string | null, { correct: number; total: number }>();

  for (const row of rows) {
    const correct = row.slots.filter((slot) => slot.correct).length;

    const typeEntry = byType.get(row.type) ?? { correct: 0, total: 0 };
    typeEntry.total += row.span;
    typeEntry.correct += correct;
    byType.set(row.type, typeEntry);

    const passageEntry = byPassage.get(row.passageId) ?? { correct: 0, total: 0 };
    passageEntry.total += row.span;
    passageEntry.correct += correct;
    byPassage.set(row.passageId, passageEntry);
  }

  const questionTypeBreakdown: QuestionTypeStat[] = QUESTION_TYPE_ORDER.filter((type) => byType.has(type)).map((type) => {
    const { correct, total } = byType.get(type)!;
    return { type, label: QUESTION_TYPE_META[type].label, correct, wrong: total - correct, total, accuracy: total > 0 ? correct / total : 0 };
  });

  const weakAreas: WeakArea[] = questionTypeBreakdown
    .filter((area) => area.total >= 2 && area.accuracy < 1)
    .map(({ type, label, correct, total, accuracy }) => ({ type, label, correct, total, accuracy }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);

  const eligibleForStrong = questionTypeBreakdown.filter((area) => area.total >= 2);
  const topAccuracy = eligibleForStrong.length > 0 ? Math.max(...eligibleForStrong.map((a) => a.accuracy)) : 0;
  const strongAreas: WeakArea[] = eligibleForStrong
    .filter((area) => area.accuracy === topAccuracy && area.accuracy > 0)
    .map(({ type, label, correct, total, accuracy }) => ({ type, label, correct, total, accuracy }))
    .slice(0, 3);

  const orderedPassages = result.mockTest.passages;
  const partBreakdown: PartBreakdown[] =
    orderedPassages.length > 0
      ? orderedPassages.map((passage, index) => {
          const entry = byPassage.get(passage.id) ?? { correct: 0, total: 0 };
          return { passageId: passage.id, label: passage.title?.trim() ? passage.title : `Part ${index + 1}`, correct: entry.correct, total: entry.total };
        })
      : [];

  const totalQuestions = totals.total;
  const totalCorrect = totals.correct;
  const answered = totals.answered;

  const accuracy: AccuracyStats = {
    accuracyPercent: totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : null,
    answered,
    skipped: Math.max(0, totalQuestions - answered),
    total: totalQuestions,
    timeUsedSeconds: result.durationSeconds,
  };

  const skillHref = result.skill === "LISTENING" ? "/student/tests/listening" : "/student/tests/reading";
  const recommendationText =
    weakAreas.length > 0
      ? `Practice more ${weakAreas[0].label} questions — you got ${weakAreas[0].correct}/${weakAreas[0].total} right this attempt.`
      : null;

  return {
    weakAreas,
    strongAreas,
    questionTypeBreakdown,
    partBreakdown,
    accuracy,
    recommendedPracticeHref: weakAreas.length > 0 ? skillHref : null,
    recommendationText,
  };
}
