import "server-only";
import type { VocabularyStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { VOCABULARY_STATUS_LABELS } from "@/lib/labels";

export type WordFrequency = { word: string; count: number };

export type ArticleAnalytics = {
  totalReaders: number;
  totalViews: number;
  /** Percent of readers who started (have a ReadingProgress row) and went on to finish. Null when nobody has started yet. */
  completionRate: number | null;
  mostHighlightedWords: WordFrequency[];
  mostDifficultWords: WordFrequency[];
  /** Phase 19 — real VocabularyLookup rows for this article (every click, including repeats), distinct from mostHighlightedWords above (which counts unique students who saved a word, not total clicks). */
  totalVocabularyLookups: number;
  mostSearchedWord: WordFrequency | null;
  mostCommonDifficulty: { color: VocabularyStatus; label: string; count: number } | null;
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

  const [totalViews, readerIds, progressRows, highlightedRows, difficultRows, totalVocabularyLookups, lookupWordCounts, difficultyRows] =
    await Promise.all([
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
      prisma.vocabularyLookup.count({ where: { articleId } }),
      prisma.vocabularyLookup.groupBy({
        by: ["vocabularyWordId"],
        where: { articleId },
        _count: { _all: true },
        orderBy: { _count: { vocabularyWordId: "desc" } },
        take: 1,
      }),
      prisma.vocabularyLookup.groupBy({
        by: ["difficultyColor"],
        where: { articleId },
        _count: { _all: true },
        orderBy: { _count: { difficultyColor: "desc" } },
        take: 1,
      }),
    ]);

  const completionRate =
    progressRows.length === 0
      ? null
      : Math.round((progressRows.filter((p) => p.completedAt != null).length / progressRows.length) * 100);

  let mostSearchedWord: WordFrequency | null = null;
  if (lookupWordCounts.length > 0) {
    const top = lookupWordCounts[0];
    const word = await prisma.vocabularyWord.findUnique({ where: { id: top.vocabularyWordId }, select: { word: true } });
    if (word) mostSearchedWord = { word: word.word, count: top._count._all };
  }

  const mostCommonDifficulty =
    difficultyRows.length > 0
      ? {
          color: difficultyRows[0].difficultyColor,
          label: VOCABULARY_STATUS_LABELS[difficultyRows[0].difficultyColor],
          count: difficultyRows[0]._count._all,
        }
      : null;

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
    totalVocabularyLookups,
    mostSearchedWord,
    mostCommonDifficulty,
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
