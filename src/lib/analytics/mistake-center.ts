import "server-only";
import type { GrammarIssue } from "@/lib/ai/writing";

import { prisma } from "@/lib/prisma";

export type ReadingListeningMistake = {
  resultId: string;
  questionId: string;
  testTitle: string;
  skill: "READING" | "LISTENING";
  prompt: string;
  studentAnswer: unknown;
  correctAnswer: unknown;
  completedAt: Date;
};

/** Every wrong Reading/Listening answer this student has, across every completed attempt — the raw material for the Mistake Center's Reading/Listening groups. */
export async function getReadingListeningMistakes(studentId: string, limit = 100): Promise<ReadingListeningMistake[]> {
  const answers = await prisma.answer.findMany({
    where: { isCorrect: false, result: { studentId, completedAt: { not: null }, skill: { in: ["READING", "LISTENING"] } } },
    orderBy: { result: { completedAt: "desc" } },
    take: limit,
    select: {
      resultId: true,
      questionId: true,
      response: true,
      question: { select: { prompt: true, correctAnswer: true } },
      result: { select: { completedAt: true, skill: true, mockTest: { select: { title: true } } } },
    },
  });

  return answers.map((answer) => ({
    resultId: answer.resultId,
    questionId: answer.questionId,
    testTitle: answer.result.mockTest.title,
    skill: answer.result.skill as "READING" | "LISTENING",
    prompt: answer.question.prompt,
    studentAnswer: answer.response,
    correctAnswer: answer.question.correctAnswer,
    completedAt: answer.result.completedAt as Date,
  }));
}

export type WritingMistake = {
  submissionId: string;
  taskType: string;
  category: string;
  mistake: string;
  correction: string;
  explanation: string;
  createdAt: Date;
};

/** Real grammar issues the AI Writing Checker already found — no re-analysis, just surfacing what's already stored. */
export async function getWritingMistakes(studentId: string, limit = 50): Promise<WritingMistake[]> {
  const analyses = await prisma.writingAnalysis.findMany({
    where: { submission: { studentId, status: { not: "DRAFT" } } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { createdAt: true, grammarIssues: true, submission: { select: { id: true, taskType: true } } },
  });

  const mistakes: WritingMistake[] = [];
  for (const analysis of analyses) {
    const issues = Array.isArray(analysis.grammarIssues) ? (analysis.grammarIssues as unknown as GrammarIssue[]) : [];
    for (const issue of issues) {
      mistakes.push({
        submissionId: analysis.submission.id,
        taskType: analysis.submission.taskType,
        category: issue.category,
        mistake: issue.mistake,
        correction: issue.correction,
        explanation: issue.explanation,
        createdAt: analysis.createdAt,
      });
    }
  }
  return mistakes.slice(0, limit);
}

export type SpeakingReviewEntry = {
  submissionId: string;
  taskTitle: string;
  part: number;
  bandScore: number;
  feedback: string;
  evaluatedAt: Date;
};

/**
 * Phase 27 — no structured per-question "mistake" list for Speaking (unlike
 * Reading/Listening's wrong-answer records); the AI's own feedback IS the
 * mistake record here. Ordered by evaluatedAt (the real AI-scoring
 * timestamp) rather than reviewedAt, which is now a separate, optional
 * teacher-notes timestamp that's frequently null.
 */
export async function getSpeakingReviews(studentId: string, limit = 50): Promise<SpeakingReviewEntry[]> {
  const submissions = await prisma.speakingSubmission.findMany({
    where: { studentId, status: "REVIEWED", bandScore: { not: null }, feedback: { not: null } },
    orderBy: { evaluatedAt: "desc" },
    take: limit,
    select: { id: true, part: true, bandScore: true, feedback: true, evaluatedAt: true, task: { select: { title: true } } },
  });

  return submissions.map((s) => ({
    submissionId: s.id,
    taskTitle: s.task.title,
    part: s.part,
    bandScore: s.bandScore as number,
    feedback: s.feedback as string,
    evaluatedAt: s.evaluatedAt as Date,
  }));
}
