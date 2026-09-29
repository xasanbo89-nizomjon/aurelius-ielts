import "server-only";

import { prisma } from "@/lib/prisma";

export type StudentReadingStats = {
  articlesRead: number;
  totalReadingTimeSeconds: number;
  wordsSaved: number;
  highlightsCreated: number;
  readingStreak: number;
};

/** Real consecutive-day streak of genuine article-reading activity (StudyActivity rows of type ARTICLE with real recorded seconds), walking back from today. Independent of the platform-wide StudyStreak, which blends every study type together. */
async function getArticleReadingStreak(studentId: string): Promise<number> {
  const rows = await prisma.studyActivity.findMany({
    where: { studentId, type: "ARTICLE", durationSeconds: { gt: 0 } },
    select: { activityDate: true },
    orderBy: { activityDate: "desc" },
  });
  if (rows.length === 0) return 0;

  const days = new Set(rows.map((r) => r.activityDate.getTime()));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  const cursor = new Date(today);
  // Today doesn't have to already have activity for the streak to still count as "current" (the student may not have read yet today) — but the day right before today must, otherwise the streak is 0.
  if (!days.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 1);

  while (days.has(cursor.getTime())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * Phase 36 — Part 7. Every number is a real query — no fabricated
 * baselines. Reading time is the real accumulated ReadingProgress.timeSpentSeconds
 * (already tracked since Phase 17), words saved reuses the existing
 * StudentVocabulary count, highlights created is the new ArticleHighlight
 * table.
 */
export async function getStudentReadingStats(studentId: string): Promise<StudentReadingStats> {
  const [articlesRead, timeAgg, wordsSaved, highlightsCreated, readingStreak] = await Promise.all([
    prisma.readingProgress.count({ where: { studentId, completedAt: { not: null } } }),
    prisma.readingProgress.aggregate({ where: { studentId }, _sum: { timeSpentSeconds: true } }),
    prisma.studentVocabulary.count({ where: { studentId } }),
    prisma.articleHighlight.count({ where: { studentId } }),
    getArticleReadingStreak(studentId),
  ]);

  return {
    articlesRead,
    totalReadingTimeSeconds: timeAgg._sum.timeSpentSeconds ?? 0,
    wordsSaved,
    highlightsCreated,
    readingStreak,
  };
}
