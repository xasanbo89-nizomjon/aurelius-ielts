import "server-only";

import { prisma } from "@/lib/prisma";

export type WordFrequency = { word: string; count: number };

export type ArticleAnalytics = {
  totalReaders: number;
  totalViews: number;
  /** Percent of readers who started (have a ReadingProgress row) and went on to finish. Null when nobody has started yet. */
  completionRate: number | null;
  mostHighlightedWords: WordFrequency[];
  mostDifficultWords: WordFrequency[];
};

function topWords(rows: { word: string }[], limit: number): WordFrequency[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.word, (counts.get(row.word) ?? 0) + 1);
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Every number here is a real query scoped to this one article — no placeholder data. */
export async function getArticleAnalytics(articleId: string, teacherId: string): Promise<ArticleAnalytics | null> {
  const article = await prisma.article.findFirst({ where: { id: articleId, createdById: teacherId } });
  if (!article) return null;

  const [totalViews, readerIds, progressRows, highlightedRows, difficultRows] = await Promise.all([
    prisma.articleView.count({ where: { articleId } }),
    prisma.articleView.findMany({ where: { articleId }, distinct: ["studentId"], select: { studentId: true } }),
    prisma.readingProgress.findMany({ where: { articleId }, select: { completedAt: true } }),
    prisma.studentVocabulary.findMany({
      where: { articleId },
      select: { vocabularyWord: { select: { word: true } } },
    }),
    prisma.studentVocabulary.findMany({
      where: { articleId, status: "UNKNOWN" },
      select: { vocabularyWord: { select: { word: true } } },
    }),
  ]);

  const completionRate =
    progressRows.length === 0
      ? null
      : Math.round((progressRows.filter((p) => p.completedAt != null).length / progressRows.length) * 100);

  return {
    totalReaders: readerIds.length,
    totalViews,
    completionRate,
    mostHighlightedWords: topWords(
      highlightedRows.map((r) => ({ word: r.vocabularyWord.word })),
      10
    ),
    mostDifficultWords: topWords(
      difficultRows.map((r) => ({ word: r.vocabularyWord.word })),
      10
    ),
  };
}

export type TeacherArticlesOverview = {
  publishedCount: number;
  totalReaders: number;
  totalViews: number;
  vocabularyActivity: number;
};

/** Dashboard-widget numbers — every value a real query scoped to this teacher's own articles. */
export async function getTeacherArticlesOverview(teacherId: string): Promise<TeacherArticlesOverview> {
  const [publishedCount, readerIds, totalViews, vocabularyActivity] = await Promise.all([
    prisma.article.count({ where: { createdById: teacherId, status: "PUBLISHED" } }),
    prisma.articleView.findMany({
      where: { article: { createdById: teacherId } },
      distinct: ["studentId"],
      select: { studentId: true },
    }),
    prisma.articleView.count({ where: { article: { createdById: teacherId } } }),
    prisma.studentVocabulary.count({ where: { article: { createdById: teacherId } } }),
  ]);

  return { publishedCount, totalReaders: readerIds.length, totalViews, vocabularyActivity };
}
