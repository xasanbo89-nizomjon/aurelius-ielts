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

// ---------------------------------------------------------------------------
// Articles (Phase 36) — bookmark an article to resume/revisit later (Reading Library)
// ---------------------------------------------------------------------------

export async function isArticleBookmarked(studentId: string, articleId: string): Promise<boolean> {
  const row = await prisma.articleBookmark.findUnique({
    where: { studentId_articleId: { studentId, articleId } },
    select: { id: true },
  });
  return row != null;
}

export async function toggleArticleBookmark(studentId: string, articleId: string): Promise<{ bookmarked: boolean }> {
  const existing = await prisma.articleBookmark.findUnique({
    where: { studentId_articleId: { studentId, articleId } },
  });

  if (existing) {
    await prisma.articleBookmark.delete({ where: { id: existing.id } });
    return { bookmarked: false };
  }

  await prisma.articleBookmark.create({ data: { studentId, articleId } });
  return { bookmarked: true };
}

export type BookmarkedArticleRow = {
  id: string;
  articleId: string;
  title: string;
  category: string;
  difficulty: string;
  readingMinutes: number;
  bookmarkedAt: Date;
  percentComplete: number;
};

/** The Reading Library (Part 8) — every article this student has bookmarked to resume/revisit, with their real progress on each. */
export async function listBookmarkedArticles(studentId: string): Promise<BookmarkedArticleRow[]> {
  const rows = await prisma.articleBookmark.findMany({
    where: { studentId, article: { status: "PUBLISHED" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      articleId: true,
      createdAt: true,
      article: {
        select: {
          title: true,
          category: true,
          difficulty: true,
          readingMinutes: true,
          readingProgress: { where: { studentId }, select: { percentComplete: true }, take: 1 },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    articleId: row.articleId,
    title: row.article.title,
    category: row.article.category,
    difficulty: row.article.difficulty,
    readingMinutes: row.article.readingMinutes,
    bookmarkedAt: row.createdAt,
    percentComplete: row.article.readingProgress[0]?.percentComplete ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Phase 45 — Reading Library
// ---------------------------------------------------------------------------

export async function isReadingLibraryItemBookmarked(studentId: string, itemId: string): Promise<boolean> {
  const row = await prisma.readingLibraryBookmark.findUnique({
    where: { studentId_itemId: { studentId, itemId } },
    select: { id: true },
  });
  return row != null;
}

export async function toggleReadingLibraryBookmark(studentId: string, itemId: string): Promise<{ bookmarked: boolean }> {
  const existing = await prisma.readingLibraryBookmark.findUnique({
    where: { studentId_itemId: { studentId, itemId } },
  });

  if (existing) {
    await prisma.readingLibraryBookmark.delete({ where: { id: existing.id } });
    return { bookmarked: false };
  }

  await prisma.readingLibraryBookmark.create({ data: { studentId, itemId } });
  return { bookmarked: true };
}

// ---------------------------------------------------------------------------
// Phase 45 — Listening Library
// ---------------------------------------------------------------------------

export async function isListeningLibraryItemBookmarked(studentId: string, itemId: string): Promise<boolean> {
  const row = await prisma.listeningLibraryBookmark.findUnique({
    where: { studentId_itemId: { studentId, itemId } },
    select: { id: true },
  });
  return row != null;
}

export async function toggleListeningLibraryBookmark(studentId: string, itemId: string): Promise<{ bookmarked: boolean }> {
  const existing = await prisma.listeningLibraryBookmark.findUnique({
    where: { studentId_itemId: { studentId, itemId } },
  });

  if (existing) {
    await prisma.listeningLibraryBookmark.delete({ where: { id: existing.id } });
    return { bookmarked: false };
  }

  await prisma.listeningLibraryBookmark.create({ data: { studentId, itemId } });
  return { bookmarked: true };
}
