import "server-only";

import { prisma } from "@/lib/prisma";
import { bandForSection, overallBandFromSections, overallBandLabel, requiredSectionsFor, writingTaskBand } from "@/lib/full-mock-band-composition";
import { fullMockTimeUsed, type FullMockTimeUsed } from "@/lib/exam/section-deadline";

/** `included` is false for a skill the mock doesn't test (e.g. a Listening + Reading + Writing mock has no Speaking) — the results page hides those instead of showing a permanent "—". */
export type FullMockSectionBand = {
  label: string;
  band: number | null;
  included: boolean;
  /** Marks earned out of marks available — Listening and Reading only. */
  rawScore: number | null;
  totalMarks: number | null;
};

/** `band` is the teacher's mark; null = awaiting teacher review. */
export type FullMockWritingTaskResult = { label: string; band: number | null; words: number | null; awaitingReview: boolean };

export type FullMockResults = {
  fullMockTestId: string;
  fullMockTestTitle: string;
  completedAt: Date | null;
  /** The sitting's total time: the sum of its sections (Phase K), not the clock time from first click to last. */
  durationSeconds: number | null;
  /** Time used per section (Listening and Reading as stored when they ended, Writing = min(end - start, 60 min)). */
  timeUsed: FullMockTimeUsed;
  overallBand: number | null;
  /** "Overall (L/R/W, unofficial)" - says which skills the figure is made of. */
  overallLabel: string;
  sections: {
    listening: FullMockSectionBand;
    reading: FullMockSectionBand;
    writing: FullMockSectionBand;
    speaking: FullMockSectionBand;
  };
  /** Per-task Writing detail; the Writing band above is composed from these (Task 2 counts double). */
  writingTasks: FullMockWritingTaskResult[];
  /** True while a Writing task is handed in but not yet marked by the teacher: the Writing band (and so the combined figure) is "Awaiting teacher review". */
  writingAwaitingReview: boolean;
  /** True when an essay was handed in with text but has neither a teacher's mark nor the AI marker's feedback yet — the results page then offers to generate the feedback now. */
  writingNeedsFeedback: boolean;
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
      writingStartedAt: true,
      writingEndedAt: true,
      fullMockTest: { select: { id: true, title: true, _count: { select: { writingSections: true, speakingSections: true } } } },
      sectionResults: {
        select: {
          section: true,
          result: { select: { bandScore: true, rawScore: true, durationSeconds: true, mockTest: { select: { questions: { select: { points: true } } } } } },
          writingSubmission: { select: { bandScore: true, taskType: true, wordCount: true, content: true, submittedAt: true, analysis: { select: { id: true, estimatedBand: true } } } },
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

  const required = requiredSectionsFor({ writingSectionCount: attempt.fullMockTest._count.writingSections, speakingSectionCount: attempt.fullMockTest._count.speakingSections });
  const overallBand = overallBandFromSections(attempt.sectionResults, required);

  const writingTasks: FullMockWritingTaskResult[] = attempt.sectionResults
    .filter((r) => r.section === "WRITING" && r.writingSubmission)
    .map((r) => {
      const band = writingTaskBand(r.writingSubmission!);
      return { label: r.writingSubmission!.taskType ?? "Task", band, words: r.writingSubmission!.wordCount, awaitingReview: band == null };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  // Writing counts as "handed in" once the paper has ended; the section's own time used is its start to its end (see fullMockTimeUsed).
  const lastSubmittedAt = attempt.sectionResults.map((r) => r.writingSubmission?.submittedAt).filter((d): d is Date => d != null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const timeUsed = fullMockTimeUsed({
    listeningSeconds: attempt.sectionResults.find((r) => r.section === "LISTENING")?.result?.durationSeconds,
    readingSeconds: attempt.sectionResults.find((r) => r.section === "READING")?.result?.durationSeconds,
    hasWriting: includesWriting,
    writingStartedAt: attempt.writingStartedAt,
    // A sitting finished before Phase K has no recorded end for Writing: its last essay's hand-in is the end.
    writingEndedAt: attempt.writingEndedAt ?? lastSubmittedAt,
  });

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
    durationSeconds: attempt.completedAt ? timeUsed.total : null,
    timeUsed,
    overallBand,
    overallLabel: overallBandLabel(required),
    sections,
    writingTasks,
    writingAwaitingReview: writingTasks.some((task) => task.awaitingReview),
    writingNeedsFeedback: attempt.sectionResults.some((r) => r.section === "WRITING" && r.writingSubmission && r.writingSubmission.bandScore == null && r.writingSubmission.analysis == null && r.writingSubmission.content.trim().length > 0),
    strengths,
    weaknesses,
    recommendations,
  };
}
