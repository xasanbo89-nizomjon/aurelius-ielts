import "server-only";

import { prisma } from "@/lib/prisma";
import { QUESTION_TYPE_META } from "@/lib/exam/question-types";

const MIN_SAMPLE_SIZE = 3;

export type MostRequestedExplanationRow = {
  questionId: string;
  prompt: string;
  testTitle: string;
  requestCount: number;
};

/** Ranks this teacher's questions by real "Explain More" click volume — one grouped query, not N+1. */
export async function getMostRequestedExplanations(
  teacherId: string,
  limit = 8
): Promise<MostRequestedExplanationRow[]> {
  const grouped = await prisma.aiExplanationRequest.groupBy({
    by: ["questionId"],
    where: { question: { mockTest: { createdById: teacherId } } },
    _count: { questionId: true },
    orderBy: { _count: { questionId: "desc" } },
    take: limit,
  });
  if (grouped.length === 0) return [];

  const questions = await prisma.question.findMany({
    where: { id: { in: grouped.map((row) => row.questionId) } },
    select: { id: true, prompt: true, mockTest: { select: { title: true } } },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));

  return grouped
    .map((row) => {
      const question = byId.get(row.questionId);
      if (!question) return null;
      return {
        questionId: row.questionId,
        prompt: question.prompt,
        testTitle: question.mockTest.title,
        requestCount: row._count.questionId,
      };
    })
    .filter((row): row is MostRequestedExplanationRow => row != null);
}

export type MostConfusingQuestionRow = {
  questionId: string;
  prompt: string;
  testTitle: string;
  questionType: string;
  incorrectPercent: number;
  totalAnswers: number;
};

/**
 * Questions with the highest wrong-answer rate across every test this
 * teacher owns — an independent real signal from "most requested", gated by
 * a minimum sample size so one unlucky answer can't look like a pattern.
 */
export async function getMostConfusingQuestions(teacherId: string, limit = 8): Promise<MostConfusingQuestionRow[]> {
  const questions = await prisma.question.findMany({
    where: { mockTest: { createdById: teacherId } },
    select: {
      id: true,
      prompt: true,
      type: true,
      mockTest: { select: { title: true } },
      answers: { where: { isCorrect: { not: null } }, select: { isCorrect: true } },
    },
  });

  return questions
    .map((question) => {
      const total = question.answers.length;
      const incorrect = question.answers.filter((a) => !a.isCorrect).length;
      return {
        questionId: question.id,
        prompt: question.prompt,
        testTitle: question.mockTest.title,
        questionType: QUESTION_TYPE_META[question.type].label,
        incorrectPercent: total > 0 ? Math.round((incorrect / total) * 100) : 0,
        totalAnswers: total,
      };
    })
    .filter((row) => row.totalAnswers >= MIN_SAMPLE_SIZE)
    .sort((a, b) => b.incorrectPercent - a.incorrectPercent)
    .slice(0, limit);
}
