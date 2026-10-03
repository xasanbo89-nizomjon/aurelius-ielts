import "server-only";

import { prisma } from "@/lib/prisma";
import { bandForSection, overallBandFromSections, requiredSectionsFor, writingBandIsEstimate, writingTaskBand } from "@/lib/full-mock-band-composition";

/** `included` is false for a skill the mock doesn't test (e.g. a Listening + Reading + Writing mock has no Speaking) — the results page hides those instead of showing a permanent "—". */
export type FullMockSectionBand = {
  label: string;
  band: number | null;
  included: boolean;
  /** Marks earned out of marks available — Listening and Reading only. */
  rawScore: number | null;
  totalMarks: number | null;
};

export type FullMockWritingTaskResult = { label: string; band: number | null; words: number | null; estimated: boolean };

export type FullMockResults = {
  fullMockTestId: string;
  fullMockTestTitle: string;
  completedAt: Date | null;
  /** Start to finish of the whole sitting. */
  durationSeconds: number | null;
  overallBand: number | null;
  sections: {
    listening: FullMockSectionBand;
    reading: FullMockSectionBand;
    writing: FullMockSectionBand;
    speaking: FullMockSectionBand;
  };
  /** Per-task Writing detail; the Writing band above is composed from these (Task 2 counts double). */
  writingTasks: FullMockWritingTaskResult[];
  /** True while any Writing task is banded by the AI marker's estimate because no teacher has marked it yet. */
  writingIsEstimate: boolean;
  /** True when an essay was handed in with text but has neither a teacher's mark nor the AI marker's band yet — the results page then offers to mark it now. */
  writingUnmarked: boolean;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
};

/**
 * Phase 34 — Part 9. Every band here is real: Listening/Reading come from
 * the same Result.bandScore the standalone exam engine already computes,
 * Writing is composed from its tasks' bands (teacher's mark, else the AI
 * marker's estimate — see full-mock-band-composition) and Speaking from the
 * AI-graded submissions. Overall Band is only ever shown when every section
 * the mock contains has a real band — never averaged from partial data, and
 * never invented.
 */
export async function getFullMockAttemptResults(attemptId: string, studentId: string): Promise<FullMockResults | null> {
  const attempt = await prisma.fullMockAttempt.findFirst({
    where: { id: attemptId, studentId },
    select: {
      startedAt: true,
      completedAt: true,
      fullMockTest: { select: { id: true, title: true, _count: { select: { writingSections: true, speakingSections: true } } } },
      sectionResults: {
        select: {
          section: true,
          result: { select: { bandScore: true, rawScore: true, mockTest: { select: { questions: { select: { points: true } } } } } },
          writingSubmission: { select: { bandScore: true, taskType: true, wordCount: true, analysis: { select: { estimatedBand: true } } } },
          speakingSubmission: { select: { bandScore: true } },
        },
      },
    },
  });
  if (!attempt) return null;

  const includesWriting = attempt.fullMockTest._count.writingSections > 0;
  const includesSpeaking = attempt.fullMockTest._count.speakingSections > 0;

  const marks = (section: "LISTENING" | "READING") => {
    const result = attempt.sectionResults.find((r) => r.section === section)?.result;
    return result
      ? { rawScore: result.rawScore, totalMarks: result.mockTest.questions.reduce((sum, q) => sum + q.points, 0) }
      : { rawScore: null, totalMarks: null };
  };

  const sections: FullMockResults["sections"] = {
    listening: { label: "Listening", band: bandForSection(attempt.sectionResults, "LISTENING"), included: true, ...marks("LISTENING") },
    reading: { label: "Reading", band: bandForSection(attempt.sectionResults, "READING"), included: true, ...marks("READING") },
    writing: { label: "Writing", band: bandForSection(attempt.sectionResults, "WRITING"), included: includesWriting, rawScore: null, totalMarks: null },
    speaking: { label: "Speaking", band: bandForSection(attempt.sectionResults, "SPEAKING"), included: includesSpeaking, rawScore: null, totalMarks: null },
  };

  const overallBand = overallBandFromSections(
    attempt.sectionResults,
    requiredSectionsFor({ writingSectionCount: attempt.fullMockTest._count.writingSections, speakingSectionCount: attempt.fullMockTest._count.speakingSections })
  );

  const writingTasks: FullMockWritingTaskResult[] = attempt.sectionResults
    .filter((r) => r.section === "WRITING" && r.writingSubmission)
    .map((r) => ({
      label: r.writingSubmission!.taskType ?? "Task",
      band: writingTaskBand(r.writingSubmission!),
      words: r.writingSubmission!.wordCount,
      estimated: r.writingSubmission!.bandScore == null && r.writingSubmission!.analysis != null,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const known = Object.values(sections).filter((s) => s.included && s.band != null) as { label: string; band: number }[];
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
    durationSeconds: attempt.completedAt ? Math.max(0, Math.round((attempt.completedAt.getTime() - attempt.startedAt.getTime()) / 1000)) : null,
    overallBand,
    sections,
    writingTasks,
    writingUnmarked: writingTasks.some((task) => task.band == null),
    writingIsEstimate: writingBandIsEstimate(attempt.sectionResults.map((r) => ({ section: r.section, result: r.result, writingSubmission: r.writingSubmission, speakingSubmission: r.speakingSubmission }))),
    strengths,
    weaknesses,
    recommendations,
  };
}
