import "server-only";

import { prisma } from "@/lib/prisma";

function roundToIeltsBand(avg: number): number {
  return Math.ceil(avg * 2) / 2;
}

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
  const test = await prisma.fullMockTest.findFirst({ where: { id: fullMockTestId, createdById: teacherId }, select: { id: true } });
  if (!test) return null;

  const attempts = await prisma.fullMockAttempt.findMany({
    where: { fullMockTestId },
    select: {
      status: true,
      sectionResults: {
        select: {
          section: true,
          result: { select: { bandScore: true } },
          writingSubmission: { select: { bandScore: true } },
          speakingSubmission: { select: { bandScore: true } },
        },
      },
    },
  });

  const totalAttempts = attempts.length;
  const completed = attempts.filter((a) => a.status === "COMPLETED");
  const completedAttempts = completed.length;
  const completionRate = totalAttempts > 0 ? Math.round((completedAttempts / totalAttempts) * 100) : 0;

  function sectionBandForAttempt(attempt: (typeof attempts)[number], key: (typeof SECTION_KEYS)[number]): number | null {
    const rows = attempt.sectionResults.filter((r) => r.section === key);
    const bands = rows
      .map((r) => r.result?.bandScore ?? r.writingSubmission?.bandScore ?? r.speakingSubmission?.bandScore ?? null)
      .filter((b): b is number => b != null);
    return average(bands);
  }

  const sectionAverages: FullMockSectionAverage[] = SECTION_KEYS.map((key) => {
    const bands: number[] = [];
    let attemptCount = 0;
    for (const attempt of attempts) {
      const hasRows = attempt.sectionResults.some((r) => r.section === key);
      if (!hasRows) continue;
      attemptCount += 1;
      const band = sectionBandForAttempt(attempt, key);
      if (band != null) bands.push(band);
    }
    return { label: SECTION_LABELS[key], averageBand: average(bands), attemptCount };
  });

  const perAttemptOverall: number[] = [];
  for (const attempt of completed) {
    const bands = SECTION_KEYS.map((key) => sectionBandForAttempt(attempt, key));
    if (bands.every((b): b is number => b != null)) {
      perAttemptOverall.push(roundToIeltsBand(average(bands as number[])!));
    }
  }

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
