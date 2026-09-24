import "server-only";
import type { ArticleDifficulty } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getAllSkillInsights, getPerformanceOverview } from "@/lib/analytics/student-insights";

export type RecommendedArticle = { id: string; title: string; category: string; difficulty: ArticleDifficulty };
export type RecommendedTest = { id: string; title: string; type: "READING" | "LISTENING"; isFree: boolean };
export type RecommendedTask = { id: string; title: string; taskNumber: string };

export type StudentRecommendations = {
  articles: RecommendedArticle[];
  tests: RecommendedTest[];
  tasks: RecommendedTask[];
  basedOn: string[];
};

function difficultyForBand(band: number | null): ArticleDifficulty {
  if (band == null) return "INTERMEDIATE";
  if (band < 5) return "BEGINNER";
  if (band < 6.5) return "INTERMEDIATE";
  return "ADVANCED";
}

const LIMIT = 5;

/**
 * Phase 25 — "AI Recommendations": deliberately rule-based matching against
 * real weaknesses and real unstarted/unsubmitted content, not an AI-invented
 * reading list. A weak Reading/Listening skill recommends real published
 * tests of that type the student hasn't attempted; low estimated band
 * recommends real unread articles at a matching real difficulty; any
 * writing weakness recommends real assigned-but-unsubmitted tasks.
 */
export async function getRecommendationsForStudent(studentId: string, teacherId: string | null): Promise<StudentRecommendations> {
  const [insights, overview] = await Promise.all([getAllSkillInsights(studentId), getPerformanceOverview(studentId)]);

  const weakSkills = new Set(insights.filter((i) => i.tone === "weak").map((i) => i.skill));
  const basedOn = insights.filter((i) => i.tone === "weak").map((i) => i.label);

  const [attemptedTestIds, readArticleIds, readingListeningTests, articles, tasks] = await Promise.all([
    prisma.result.findMany({ where: { studentId }, select: { mockTestId: true }, distinct: ["mockTestId"] }),
    prisma.readingProgress.findMany({ where: { studentId }, select: { articleId: true } }),
    prisma.mockTest.findMany({
      where: { type: { in: ["READING", "LISTENING"] }, isPublished: true, isArchived: false },
      select: { id: true, title: true, type: true, category: true },
    }),
    teacherId
      ? prisma.article.findMany({
          where: { createdById: teacherId, status: "PUBLISHED" },
          select: { id: true, title: true, category: true, difficulty: true },
        })
      : Promise.resolve([]),
    prisma.writingTask.findMany({
      where: { status: "PUBLISHED", assignments: { some: { studentId } } },
      select: { id: true, title: true, taskNumber: true, submissions: { where: { studentId }, select: { id: true } } },
    }),
  ]);

  const attemptedIds = new Set(attemptedTestIds.map((r) => r.mockTestId));
  const readIds = new Set(readArticleIds.map((r) => r.articleId));

  const wantsReading = weakSkills.has("READING") || weakSkills.size === 0;
  const wantsListening = weakSkills.has("LISTENING") || weakSkills.size === 0;

  const tests: RecommendedTest[] = readingListeningTests
    .filter((t) => !attemptedIds.has(t.id) && ((t.type === "READING" && wantsReading) || (t.type === "LISTENING" && wantsListening)))
    .slice(0, LIMIT)
    .map((t) => ({ id: t.id, title: t.title, type: t.type as "READING" | "LISTENING", isFree: t.category === "CAMBRIDGE" }));

  const targetDifficulty = difficultyForBand(overview.avgBand);
  const recommendedArticles: RecommendedArticle[] = articles
    .filter((a) => !readIds.has(a.id) && a.difficulty === targetDifficulty)
    .slice(0, LIMIT)
    .map((a) => ({ id: a.id, title: a.title, category: a.category, difficulty: a.difficulty }));

  const recommendedTasks: RecommendedTask[] = tasks
    .filter((t) => t.submissions.length === 0)
    .slice(0, LIMIT)
    .map((t) => ({ id: t.id, title: t.title, taskNumber: t.taskNumber }));

  return { articles: recommendedArticles, tests, tasks: recommendedTasks, basedOn };
}
