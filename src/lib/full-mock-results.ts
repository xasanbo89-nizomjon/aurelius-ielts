import "server-only";

import { prisma } from "@/lib/prisma";

/** Official IELTS overall-band rounding: .25 rounds up to the next .5, .75 rounds up to the next whole band. */
function roundToIeltsBand(average: number): number {
  return Math.ceil(average * 2) / 2;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export type FullMockSectionBand = { label: string; band: number | null };

export type FullMockResults = {
  fullMockTestId: string;
  fullMockTestTitle: string;
  completedAt: Date | null;
  overallBand: number | null;
  sections: {
    listening: FullMockSectionBand;
    reading: FullMockSectionBand;
    writing: FullMockSectionBand;
    speaking: FullMockSectionBand;
  };
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
};

/**
 * Phase 34 — Part 9. Every band here is real: Listening/Reading come from
 * the same Result.bandScore the standalone exam engine already computes,
 * Writing/Speaking are the real average of the AI-graded bandScore on each
 * linked submission. Overall Band is only ever shown when all four are
 * real numbers — never averaged from partial data, and never invented.
 */
export async function getFullMockAttemptResults(attemptId: string, studentId: string): Promise<FullMockResults | null> {
  const attempt = await prisma.fullMockAttempt.findFirst({
    where: { id: attemptId, studentId },
    select: {
      completedAt: true,
      fullMockTest: { select: { id: true, title: true } },
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
  if (!attempt) return null;

  const listeningBand = attempt.sectionResults.find((r) => r.section === "LISTENING")?.result?.bandScore ?? null;
  const readingBand = attempt.sectionResults.find((r) => r.section === "READING")?.result?.bandScore ?? null;

  const writingBands = attempt.sectionResults
    .filter((r) => r.section === "WRITING")
    .map((r) => r.writingSubmission?.bandScore)
    .filter((b): b is number => b != null);
  const speakingBands = attempt.sectionResults
    .filter((r) => r.section === "SPEAKING")
    .map((r) => r.speakingSubmission?.bandScore)
    .filter((b): b is number => b != null);

  const writingBand = average(writingBands);
  const speakingBand = average(speakingBands);

  const sections: FullMockResults["sections"] = {
    listening: { label: "Listening", band: listeningBand },
    reading: { label: "Reading", band: readingBand },
    writing: { label: "Writing", band: writingBand },
    speaking: { label: "Speaking", band: speakingBand },
  };

  const allBands = [listeningBand, readingBand, writingBand, speakingBand];
  const overallBand = allBands.every((b): b is number => b != null) ? roundToIeltsBand(average(allBands as number[])!) : null;

  const known = Object.values(sections).filter((s) => s.band != null) as { label: string; band: number }[];
  const sorted = [...known].sort((a, b) => b.band - a.band);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];

  const strengths =
    strongest && (!weakest || strongest.label !== weakest.label || sorted.length === 1)
      ? [`${strongest.label} is your strongest section at band ${strongest.band.toFixed(1)}.`]
      : [];
  const weaknesses =
    weakest && weakest.band !== strongest?.band
      ? [`${weakest.label} is your weakest section at band ${weakest.band.toFixed(1)}.`]
      : [];
  const recommendations =
    weakest && weakest.band !== strongest?.band
      ? [`Prioritize ${weakest.label.toLowerCase()} practice — it's currently pulling your overall band down the most.`]
      : known.length > 0
        ? ["Your section bands are evenly matched — keep practicing all four skills to push your overall band higher."]
        : [];

  return {
    fullMockTestId: attempt.fullMockTest.id,
    fullMockTestTitle: attempt.fullMockTest.title,
    completedAt: attempt.completedAt,
    overallBand,
    sections,
    strengths,
    weaknesses,
    recommendations,
  };
}
