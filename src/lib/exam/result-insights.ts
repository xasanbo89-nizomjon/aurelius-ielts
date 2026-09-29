import type { QuestionType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";

export type WeakArea = { type: QuestionType; label: string; correct: number; total: number; accuracy: number };

export type ResultInsights = {
  weakAreas: WeakArea[];
  recommendedPracticeHref: string | null;
  recommendationText: string | null;
};

/**
 * Phase 35 — Part 11. Real per-question-type accuracy for THIS attempt only
 * (never a fabricated "typical weakness") — a type only counts as a weak
 * area once it has at least 2 real questions in this attempt, so a single
 * miss on a rare type doesn't get overblown into a conclusion.
 */
export async function getResultInsights(resultId: string, studentId: string): Promise<ResultInsights | null> {
  const result = await prisma.result.findFirst({
    where: { id: resultId, studentId, completedAt: { not: null } },
    select: {
      skill: true,
      answers: { select: { isCorrect: true, question: { select: { type: true } } } },
    },
  });
  if (!result) return null;

  const byType = new Map<QuestionType, { correct: number; total: number }>();
  for (const answer of result.answers) {
    const type = answer.question.type;
    const entry = byType.get(type) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (answer.isCorrect) entry.correct += 1;
    byType.set(type, entry);
  }

  const weakAreas: WeakArea[] = [...byType.entries()]
    .map(([type, { correct, total }]) => ({ type, label: QUESTION_TYPE_META[type].label, correct, total, accuracy: correct / total }))
    .filter((area) => area.total >= 2 && area.accuracy < 1)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);

  const skillHref = result.skill === "LISTENING" ? "/student/tests/listening" : "/student/tests/reading";
  const recommendationText =
    weakAreas.length > 0
      ? `Practice more ${weakAreas[0].label} questions — you got ${weakAreas[0].correct}/${weakAreas[0].total} right this attempt.`
      : null;

  return {
    weakAreas,
    recommendedPracticeHref: weakAreas.length > 0 ? skillHref : null,
    recommendationText,
  };
}
