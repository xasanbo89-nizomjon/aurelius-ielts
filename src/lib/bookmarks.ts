import "server-only";

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Reading/Listening — bookmark a difficult Question
// ---------------------------------------------------------------------------

export async function isQuestionBookmarked(studentId: string, questionId: string): Promise<boolean> {
  const row = await prisma.questionBookmark.findUnique({
    where: { studentId_questionId: { studentId, questionId } },
    select: { id: true },
  });
  return row != null;
}

/** Scoped lookup for the exam runner — just the question IDs (within one test) this student already bookmarked, to seed initial UI state. */
export async function getBookmarkedQuestionIds(studentId: string, questionIds: string[]): Promise<string[]> {
  if (questionIds.length === 0) return [];
  const rows = await prisma.questionBookmark.findMany({
    where: { studentId, questionId: { in: questionIds } },
    select: { questionId: true },
  });
  return rows.map((r) => r.questionId);
}

export async function toggleQuestionBookmark(studentId: string, questionId: string): Promise<{ bookmarked: boolean }> {
  const existing = await prisma.questionBookmark.findUnique({
    where: { studentId_questionId: { studentId, questionId } },
  });

  if (existing) {
    await prisma.questionBookmark.delete({ where: { id: existing.id } });
    return { bookmarked: false };
  }

  await prisma.questionBookmark.create({ data: { studentId, questionId } });
  return { bookmarked: true };
}

export type BookmarkedQuestionRow = {
  id: string;
  questionId: string;
  prompt: string;
  skill: "READING" | "LISTENING";
  testTitle: string;
  mockTestId: string;
  bookmarkedAt: Date;
};

export async function listBookmarkedQuestions(studentId: string): Promise<BookmarkedQuestionRow[]> {
  const rows = await prisma.questionBookmark.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      questionId: true,
      createdAt: true,
      question: { select: { prompt: true, mockTest: { select: { id: true, title: true, type: true } } } },
    },
  });

  return rows
    .filter((row) => row.question.mockTest.type === "READING" || row.question.mockTest.type === "LISTENING")
    .map((row) => ({
      id: row.id,
      questionId: row.questionId,
      prompt: row.question.prompt,
      skill: row.question.mockTest.type as "READING" | "LISTENING",
      testTitle: row.question.mockTest.title,
      mockTestId: row.question.mockTest.id,
      bookmarkedAt: row.createdAt,
    }));
}

// ---------------------------------------------------------------------------
// Writing — bookmark a WritingTask prompt to revisit/practice later
// ---------------------------------------------------------------------------

export async function isWritingTaskBookmarked(studentId: string, taskId: string): Promise<boolean> {
  const row = await prisma.writingTaskBookmark.findUnique({
    where: { studentId_taskId: { studentId, taskId } },
    select: { id: true },
  });
  return row != null;
}

export async function toggleWritingTaskBookmark(studentId: string, taskId: string): Promise<{ bookmarked: boolean }> {
  const existing = await prisma.writingTaskBookmark.findUnique({
    where: { studentId_taskId: { studentId, taskId } },
  });

  if (existing) {
    await prisma.writingTaskBookmark.delete({ where: { id: existing.id } });
    return { bookmarked: false };
  }

  await prisma.writingTaskBookmark.create({ data: { studentId, taskId } });
  return { bookmarked: true };
}

export type BookmarkedWritingTaskRow = {
  id: string;
  taskId: string;
  title: string;
  taskNumber: string;
  bookmarkedAt: Date;
};

export async function listBookmarkedWritingTasks(studentId: string): Promise<BookmarkedWritingTaskRow[]> {
  const rows = await prisma.writingTaskBookmark.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    select: { id: true, taskId: true, createdAt: true, task: { select: { title: true, taskNumber: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    taskId: row.taskId,
    title: row.task.title,
    taskNumber: row.task.taskNumber,
    bookmarkedAt: row.createdAt,
  }));
}
