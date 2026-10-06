import "server-only";
import { authorScope } from "@/lib/exam/test-access";

import { prisma } from "@/lib/prisma";
import { bandForSection, overallBandFromSections, requiredSectionsFor } from "@/lib/full-mock-band-composition";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

const SECTION_KEYS = ["LISTENING", "READING", "WRITING", "SPEAKING"] as const;
const SECTION_LABELS: Record<(typeof SECTION_KEYS)[number], string> = {
  LISTENING: "Listening",
  READING: "Reading",
  WRITING: "Writing",
  SPEAKING: "Speaking",
};

export type FullMockSectionAverage = { label: string; averageBand: number | null; attemptCount: number };

export type FullMockAnalytics = {
  totalAttempts: number;
  completedAttempts: number;
  completionRate: number;
  averageOverallBand: number | null;
  sectionAverages: FullMockSectionAverage[];
  mostDifficultSection: string | null;
};

/**
 * Phase 34 — Part 10. Every number here is a real aggregate over this
 * teacher's own FullMockAttempt rows — no invented baselines, no synthetic
 * "typical" data when attempts are scarce (a section with zero real
 * attempts simply reports null/0, never a guess).
 */
export async function getFullMockTestAnalytics(fullMockTestId: string, teacherId: string): Promise<FullMockAnalytics | null> {
  const test = await prisma.fullMockTest.findFirst({
    where: { id: fullMockTestId, ...(await authorScope(teacherId)) },
    select: { id: true, _count: { select: { writingSections: true, speakingSections: true } } },
  });
  if (!test) return null;
  const required = requiredSectionsFor({ writingSectionCount: test._count.writingSections, speakingSectionCount: test._count.speakingSections });

  const attempts = await prisma.fullMockAttempt.findMany({
    where: { fullMockTestId },
    select: {
      status: true,
      sectionResults: {
        select: {
          section: true,
          result: { select: { bandScore: true } },
          writingSubmission: { select: { bandScore: true, taskType: true, analysis: { select: { estimatedBand: true } } } },
          speakingSubmission: { select: { bandScore: true } },
        },
      },
    },
  });

  const totalAttempts = attempts.length;
  const completed = attempts.filter((a) => a.status === "COMPLETED");
  const completedAttempts = completed.length;
  const completionRate = totalAttempts > 0 ? Math.round((completedAttempts / totalAttempts) * 100) : 0;

  const sectionAverages: FullMockSectionAverage[] = SECTION_KEYS.map((key) => {
    const bands: number[] = [];
    let attemptCount = 0;
    for (const attempt of attempts) {
      const hasRows = attempt.sectionResults.some((r) => r.section === key);
      if (!hasRows) continue;
      attemptCount += 1;
      const band = bandForSection(attempt.sectionResults, key);
      if (band != null) bands.push(band);
    }
    return { label: SECTION_LABELS[key], averageBand: average(bands), attemptCount };
  });

  const perAttemptOverall = completed
    .map((attempt) => overallBandFromSections(attempt.sectionResults, required))
    .filter((b): b is number => b != null);

  const withData = sectionAverages.filter((s) => s.averageBand != null);
  const mostDifficultSection =
    withData.length > 0 ? withData.reduce((min, s) => (s.averageBand! < min.averageBand! ? s : min)).label : null;

  return {
    totalAttempts,
    completedAttempts,
    completionRate,
    averageOverallBand: average(perAttemptOverall),
    sectionAverages,
    mostDifficultSection,
  };
}

export type FullMockTeacherOverview = {
  totalTests: number;
  totalAttempts: number;
  completionRate: number;
  averageBandAcrossAllExams: number | null;
  mostAttemptedExam: { id: string; title: string; attemptCount: number } | null;
  highestScoringExam: { id: string; title: string; averageBand: number } | null;
};

/**
 * Phase 47 — cross-test teacher analytics ("Most attempted exams / Highest
 * scoring exams / Average band / Completion rate"), aggregating over ALL of
 * this teacher's own Full Mock Tests at once. getFullMockTestAnalytics above
 * stays as-is (single-test drill-down); this is the new overview a teacher
 * sees across their whole Full Mock catalog. Every number is a real
 * aggregate — a teacher with zero attempts anywhere gets null/0, never a
 * fabricated example.
 */
export async function getFullMockTeacherOverviewAnalytics(teacherId: string): Promise<FullMockTeacherOverview> {
  const tests = await prisma.fullMockTest.findMany({
    where: await authorScope(teacherId),
    select: {
      id: true,
      title: true,
      _count: { select: { writingSections: true, speakingSections: true } },
      attempts: {
        select: {
          status: true,
          sectionResults: {
            select: {
              section: true,
              result: { select: { bandScore: true } },
              writingSubmission: { select: { bandScore: true, taskType: true, analysis: { select: { estimatedBand: true } } } },
              speakingSubmission: { select: { bandScore: true } },
            },
          },
        },
      },
    },
  });

  let totalAttempts = 0;
  let totalCompleted = 0;
  const allOverallBands: number[] = [];
  let mostAttempted: { id: string; title: string; attemptCount: number } | null = null;
  let highestScoring: { id: string; title: string; averageBand: number } | null = null;

  for (const test of tests) {
    const attemptCount = test.attempts.length;
    totalAttempts += attemptCount;

    const completed = test.attempts.filter((a) => a.status === "COMPLETED");
    totalCompleted += completed.length;

    const required = requiredSectionsFor({ writingSectionCount: test._count.writingSections, speakingSectionCount: test._count.speakingSections });
    const testOverallBands = completed.map((a) => overallBandFromSections(a.sectionResults, required)).filter((b): b is number => b != null);
    allOverallBands.push(...testOverallBands);
    const testAverageBand = average(testOverallBands);

    if (attemptCount > 0 && (mostAttempted === null || attemptCount > mostAttempted.attemptCount)) {
      mostAttempted = { id: test.id, title: test.title, attemptCount };
    }
    if (testAverageBand != null && (highestScoring === null || testAverageBand > highestScoring.averageBand)) {
      highestScoring = { id: test.id, title: test.title, averageBand: testAverageBand };
    }
  }

  return {
    totalTests: tests.length,
    totalAttempts,
    completionRate: totalAttempts > 0 ? Math.round((totalCompleted / totalAttempts) * 100) : 0,
    averageBandAcrossAllExams: average(allOverallBands),
    mostAttemptedExam: mostAttempted,
    highestScoringExam: highestScoring,
  };
}
