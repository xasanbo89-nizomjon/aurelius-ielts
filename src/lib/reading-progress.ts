import "server-only";

import { prisma } from "@/lib/prisma";
import { awardCoins } from "@/lib/coins";
import {
  ARTICLE_READ_COMPLETE_COINS,
  ARTICLE_AUDIO_COMPLETE_COINS,
  ARTICLE_AUDIO_COMPLETE_THRESHOLD_PERCENT,
} from "@/lib/coin-economy-constants";

/** A student is considered "done" with an article once they've scrolled past this point. */
const COMPLETION_THRESHOLD_PERCENT = 95;
/** The coin reward requires literal full completion — a stricter bar than the "done" marker above, which existed first and stays unchanged. */
const READ_COIN_THRESHOLD_PERCENT = 100;

export async function getReadingProgress(studentId: string, articleId: string) {
  return prisma.readingProgress.findUnique({ where: { studentId_articleId: { studentId, articleId } } });
}

/** awardCoins() already no-ops on a repeat idempotencyKey, so this is safe to call on every save that crosses the threshold, not just the first. */
async function awardArticleReadingCoins(studentId: string, articleId: string) {
  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { title: true } });
  await awardCoins(
    studentId,
    "ACHIEVEMENT",
    ARTICLE_READ_COMPLETE_COINS,
    `ARTICLE_READ:${studentId}:${articleId}`,
    `Completed reading "${article?.title ?? "an article"}"`
  );
}

async function awardArticleAudioCoins(studentId: string, articleId: string) {
  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { title: true } });
  await awardCoins(
    studentId,
    "ACHIEVEMENT",
    ARTICLE_AUDIO_COMPLETE_COINS,
    `ARTICLE_AUDIO:${studentId}:${articleId}`,
    `Listened to "${article?.title ?? "an article"}"`
  );
}

/**
 * Upserts the student's reading position in one article. `completedAt` is
 * set once, the first time percentComplete crosses the threshold, and
 * never cleared afterward — scrolling back up to re-read the start
 * shouldn't "un-complete" an article the student already finished.
 * `timeSpentSeconds` accumulates (never resets) across saves.
 */
export async function saveReadingProgress(
  studentId: string,
  articleId: string,
  input: { lastPosition: number; percentComplete: number; timeSpentSeconds?: number }
) {
  const existing = await prisma.readingProgress.findUnique({
    where: { studentId_articleId: { studentId, articleId } },
  });

  const justCompleted = input.percentComplete >= COMPLETION_THRESHOLD_PERCENT;
  const completedAt = existing?.completedAt ?? (justCompleted ? new Date() : null);
  const addedSeconds = Math.max(0, input.timeSpentSeconds ?? 0);

  const result = await prisma.readingProgress.upsert({
    where: { studentId_articleId: { studentId, articleId } },
    create: {
      studentId,
      articleId,
      lastPosition: input.lastPosition,
      percentComplete: input.percentComplete,
      completedAt,
      timeSpentSeconds: addedSeconds,
      lastOpenedAt: new Date(),
    },
    update: {
      lastPosition: input.lastPosition,
      percentComplete: Math.max(existing?.percentComplete ?? 0, input.percentComplete),
      completedAt,
      timeSpentSeconds: { increment: addedSeconds },
      lastOpenedAt: new Date(),
    },
  });

  if (input.percentComplete >= READ_COIN_THRESHOLD_PERCENT) {
    await awardArticleReadingCoins(studentId, articleId);
  }

  return result;
}

/**
 * Upserts the student's audio-listening position in the same
 * (student, article) row saveReadingProgress writes to — a partial Prisma
 * update only ever touches the fields passed here, so this can never
 * clobber concurrently-saved reading progress or vice versa.
 */
export async function saveAudioProgress(
  studentId: string,
  articleId: string,
  input: { audioProgress: number; timeSpentSeconds?: number }
) {
  const existing = await prisma.readingProgress.findUnique({
    where: { studentId_articleId: { studentId, articleId } },
  });
  const addedSeconds = Math.max(0, input.timeSpentSeconds ?? 0);

  const result = await prisma.readingProgress.upsert({
    where: { studentId_articleId: { studentId, articleId } },
    create: {
      studentId,
      articleId,
      audioProgress: input.audioProgress,
      timeSpentSeconds: addedSeconds,
      lastOpenedAt: new Date(),
    },
    update: {
      audioProgress: Math.max(existing?.audioProgress ?? 0, input.audioProgress),
      timeSpentSeconds: { increment: addedSeconds },
      lastOpenedAt: new Date(),
    },
  });

  if (input.audioProgress >= ARTICLE_AUDIO_COMPLETE_THRESHOLD_PERCENT) {
    await awardArticleAudioCoins(studentId, articleId);
  }

  return result;
}

export async function getCompletedArticleCount(studentId: string): Promise<number> {
  return prisma.readingProgress.count({ where: { studentId, completedAt: { not: null } } });
}
