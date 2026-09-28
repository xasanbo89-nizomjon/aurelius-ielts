import "server-only";

import { prisma } from "@/lib/prisma";

function avg(values: number[]): number | null {
  return values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
}

export type ContentType = "ARTICLE" | "TEST" | "WRITING_TASK" | "SPEAKING_TASK";
export type ContentRankingRow = {
  id: string;
  title: string;
  type: ContentType;
  engagementCount: number;
  completionRate: number | null;
  avgScore: number | null;
};

/**
 * Phase 29 — Part 6, Content Analytics. One real "most viewed/attempted"
 * ranking across all 4 content types this teacher owns — "engagement" means
 * the type-appropriate real count (article views, test attempts, writing
 * submissions, speaking submissions), never a made-up unified metric.
 */
export async function getMostViewedContent(teacherId: string, limit = 10): Promise<ContentRankingRow[]> {
  const [articles, tests, writingTasks, speakingTasks] = await Promise.all([
    prisma.article.findMany({
      where: { createdById: teacherId },
      select: {
        id: true,
        title: true,
        _count: { select: { views: true } },
        readingProgress: { select: { percentComplete: true, completedAt: true } },
      },
    }),
    prisma.mockTest.findMany({
      where: { createdById: teacherId },
      select: {
        id: true,
        title: true,
        results: { select: { completedAt: true, rawScore: true }, },
        questions: { select: { points: true } },
      },
    }),
    prisma.writingTask.findMany({
      where: { createdById: teacherId },
      select: {
        id: true,
        title: true,
        submissions: { select: { status: true, analysis: { select: { estimatedBand: true } } } },
      },
    }),
    prisma.speakingTask.findMany({
      where: { createdById: teacherId },
      select: {
        id: true,
        title: true,
        submissions: { select: { status: true, bandScore: true } },
      },
    }),
  ]);

  const rows: ContentRankingRow[] = [];

  for (const article of articles) {
    const finished = article.readingProgress.filter((p) => p.completedAt != null).length;
    rows.push({
      id: article.id,
      title: article.title,
      type: "ARTICLE",
      engagementCount: article._count.views,
      completionRate: article.readingProgress.length > 0 ? Math.round((finished / article.readingProgress.length) * 100) : null,
      avgScore: null,
    });
  }

  for (const test of tests) {
    const maxScore = test.questions.reduce((sum, q) => sum + q.points, 0);
    const completed = test.results.filter((r) => r.completedAt != null);
    const scorePercents = completed.map((r) => (r.rawScore != null && maxScore > 0 ? (r.rawScore / maxScore) * 100 : null)).filter((v): v is number => v != null);
    rows.push({
      id: test.id,
      title: test.title,
      type: "TEST",
      engagementCount: test.results.length,
      completionRate: test.results.length > 0 ? Math.round((completed.length / test.results.length) * 100) : null,
      avgScore: avg(scorePercents),
    });
  }

  for (const task of writingTasks) {
    const submitted = task.submissions.filter((s) => s.status !== "DRAFT");
    const bands = submitted.map((s) => s.analysis?.estimatedBand).filter((v): v is number => v != null);
    rows.push({
      id: task.id,
      title: task.title,
      type: "WRITING_TASK",
      engagementCount: submitted.length,
      completionRate: task.submissions.length > 0 ? Math.round((submitted.length / task.submissions.length) * 100) : null,
      avgScore: avg(bands),
    });
  }

  for (const task of speakingTasks) {
    const evaluated = task.submissions.filter((s) => s.status === "REVIEWED");
    const bands = evaluated.map((s) => s.bandScore).filter((v): v is number => v != null);
    rows.push({
      id: task.id,
      title: task.title,
      type: "SPEAKING_TASK",
      engagementCount: task.submissions.length,
      completionRate: task.submissions.length > 0 ? Math.round((evaluated.length / task.submissions.length) * 100) : null,
      avgScore: avg(bands),
    });
  }

  return rows.sort((a, b) => b.engagementCount - a.engagementCount).slice(0, limit);
}

export type DropOffBucket = { range: string; count: number };

/**
 * Real drop-off points for this teacher's articles: for every
 * ReadingProgress row that never reached completion, which quarter of the
 * article did the student stop in. A real bucketed histogram of actual
 * scroll-position data — not an estimate.
 */
export async function getArticleDropOffPoints(teacherId: string): Promise<DropOffBucket[]> {
  const rows = await prisma.readingProgress.findMany({
    where: { article: { createdById: teacherId }, completedAt: null },
    select: { percentComplete: true },
  });

  const buckets = [
    { range: "0-25%", min: 0, max: 25, count: 0 },
    { range: "25-50%", min: 25, max: 50, count: 0 },
    { range: "50-75%", min: 50, max: 75, count: 0 },
    { range: "75-99%", min: 75, max: 100, count: 0 },
  ];

  for (const row of rows) {
    const bucket = buckets.find((b) => row.percentComplete >= b.min && row.percentComplete < b.max);
    if (bucket) bucket.count++;
  }

  return buckets.map((b) => ({ range: b.range, count: b.count }));
}
