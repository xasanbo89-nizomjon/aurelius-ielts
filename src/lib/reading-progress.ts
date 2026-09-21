import "server-only";

import { prisma } from "@/lib/prisma";

/** A student is considered "done" with an article once they've scrolled past this point. */
const COMPLETION_THRESHOLD_PERCENT = 95;

export async function getReadingProgress(studentId: string, articleId: string) {
  return prisma.readingProgress.findUnique({ where: { studentId_articleId: { studentId, articleId } } });
}

/**
 * Upserts the student's position in one article. `completedAt` is set once,
 * the first time percentComplete crosses the threshold, and never cleared
 * afterward — scrolling back up to re-read the start shouldn't "un-complete"
 * an article the student already finished.
 */
export async function saveReadingProgress(
  studentId: string,
  articleId: string,
  input: { lastPosition: number; percentComplete: number }
) {
  const existing = await prisma.readingProgress.findUnique({
    where: { studentId_articleId: { studentId, articleId } },
  });

  const justCompleted = input.percentComplete >= COMPLETION_THRESHOLD_PERCENT;
  const completedAt = existing?.completedAt ?? (justCompleted ? new Date() : null);

  return prisma.readingProgress.upsert({
    where: { studentId_articleId: { studentId, articleId } },
    create: {
      studentId,
      articleId,
      lastPosition: input.lastPosition,
      percentComplete: input.percentComplete,
      completedAt,
    },
    update: {
      lastPosition: input.lastPosition,
      percentComplete: Math.max(existing?.percentComplete ?? 0, input.percentComplete),
      completedAt,
    },
  });
}

export async function getCompletedArticleCount(studentId: string): Promise<number> {
  return prisma.readingProgress.count({ where: { studentId, completedAt: { not: null } } });
}
