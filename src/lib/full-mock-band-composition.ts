import "server-only";

import { roundToIeltsBand } from "@/lib/analytics/band-rounding";
import { effectiveTaskBand } from "@/lib/writing-assessment/bands";

/**
 * Phase 47 — the one real band-composition helper, replacing what had
 * become three separate copies (full-mock-results.ts, full-mock-analytics.ts,
 * and this phase's new full-mock-dashboard.ts) of the same "average the real
 * linked submissions per section, then average those into an Overall Band"
 * logic. Listening/Reading only ever have one FullMockSectionResult row, so
 * averaging "matches of length 1" still returns that row's own real
 * Result.bandScore unchanged — the same function correctly handles Speaking's
 * multiple rows (Part 1+2+3) too.
 *
 * Phase E — Writing is composed the way the real IELTS does it: each task has
 * a band and Task 2 counts DOUBLE — Writing = (Task 1 + 2 × Task 2) / 3,
 * rounded to the nearest half band. A Writing band exists only once EVERY task
 * handed in has a band; one still waiting to be marked means "not yet", never a
 * half-finished average.
 *
 * Phase K — a task's band was the TEACHER'S mark and nothing else.
 *
 * Phase O — the AI assesses Writing (no teacher review needed): a task's band is the
 * teacher's mark when there is one (a teacher is the authority; a blank task is handed in
 * with the band 0 the exam gives "no response"), otherwise the band of the sitting's AI
 * assessment (see lib/writing-assessment). The Writing band is still (Task 1 + 2 x Task 2) / 3
 * and exists only when BOTH tasks have a band; while the assessment is waiting or running the
 * section reads "Processing". Full Mock bands are for TEACHERS only - no student page uses this.
 */
export type FullMockSectionResultBand = {
  section: string;
  result: { bandScore: number | null } | null;
  writingSubmission: {
    bandScore: number | null;
    taskType?: string | null;
    analysis?: { estimatedBand: number } | null;
    assessmentAsTask1?: { task1Band: number | null; status: string } | null;
    assessmentAsTask2?: { task2Band: number | null; status: string } | null;
  } | null;
  speakingSubmission: { bandScore: number | null } | null;
};

/** What a Writing submission contributes to a band calculation: the teacher's mark and the AI assessment's band for its task. */
export const WRITING_BAND_SELECT = {
  bandScore: true,
  taskType: true,
  assessmentAsTask1: { select: { task1Band: true, status: true } },
  assessmentAsTask2: { select: { task2Band: true, status: true } },
} as const;

/** The columns every Full Mock band calculation reads — one definition, so every dashboard and result page composes bands from identical data. */
export const FULL_MOCK_SECTION_BAND_SELECT = {
  section: true,
  result: { select: { bandScore: true } },
  writingSubmission: { select: WRITING_BAND_SELECT },
  speakingSubmission: { select: { bandScore: true } },
} as const;

const SECTIONS = ["LISTENING", "READING", "WRITING", "SPEAKING"] as const;
export type FullMockSectionKey = (typeof SECTIONS)[number];

/**
 * Phase A — which skills a given Full Mock actually tests. Listening and
 * Reading are mandatory for every mock; Writing and Speaking count only when
 * the mock has that section. A Listening + Reading + Writing mock therefore
 * gets an Overall Band from its three skills instead of waiting forever on a
 * Speaking section it never had.
 */
export function requiredSectionsFor(test: { writingSectionCount: number; speakingSectionCount: number }): FullMockSectionKey[] {
  const required: FullMockSectionKey[] = ["LISTENING", "READING"];
  if (test.writingSectionCount > 0) required.push("WRITING");
  if (test.speakingSectionCount > 0) required.push("SPEAKING");
  return required;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

type WritingSubmissionBand = NonNullable<FullMockSectionResultBand["writingSubmission"]>;

/** One Writing task's band: the teacher's mark, else the band of the AI assessment of its task. Null while neither exists (the AI assessment is still to come). */
export function writingTaskBand(submission: WritingSubmissionBand): number | null {
  const ai = submission.assessmentAsTask1?.task1Band ?? submission.assessmentAsTask2?.task2Band ?? null;
  return effectiveTaskBand(submission.bandScore, ai);
}

function writingBand(rows: FullMockSectionResultBand[]): number | null {
  const tasks = rows
    .filter((r) => r.section === "WRITING" && r.writingSubmission)
    .map((r) => ({ taskType: r.writingSubmission!.taskType ?? null, band: writingTaskBand(r.writingSubmission!) }));
  if (tasks.length === 0 || tasks.some((t) => t.band == null)) return null;

  const task1 = tasks.find((t) => t.taskType === "Task 1")?.band;
  const task2 = tasks.find((t) => t.taskType === "Task 2")?.band;
  if (task1 != null && task2 != null) return roundToIeltsBand((task1 + 2 * task2) / 3);
  return roundToIeltsBand(average(tasks.map((t) => t.band as number))!);
}

/**
 * Where a mock's Writing leg stands, in the words teachers see on every
 * results table: "Not started", "In progress" (the 60-minute session is
 * running), "1 of 2 tasks submitted", "Processing" (handed in, the AI assessment is
 * waiting or running), "AI assessment failed" or "Graded". null when the mock has no
 * Writing section.
 */
export function writingProgressLabel(args: {
  taskCount: number;
  started: boolean;
  rows: {
    section: string;
    writingSubmission: {
      status: string;
      bandScore: number | null;
      analysis?: { estimatedBand: number } | null;
      assessmentAsTask1?: { task1Band: number | null; status: string } | null;
      assessmentAsTask2?: { task2Band: number | null; status: string } | null;
    } | null;
  }[];
}): string | null {
  if (args.taskCount <= 0) return null;
  const submitted = args.rows.filter((r) => r.section === "WRITING" && r.writingSubmission && r.writingSubmission.status !== "DRAFT");
  if (submitted.length === 0) return args.started ? "In progress" : "Not started";
  if (submitted.length < args.taskCount) return `${submitted.length} of ${args.taskCount} tasks submitted`;
  if (submitted.every((r) => writingTaskBand(r.writingSubmission!) != null)) return "Graded";
  const states = submitted.map((r) => r.writingSubmission!.assessmentAsTask1?.status ?? r.writingSubmission!.assessmentAsTask2?.status ?? null);
  if (states.some((state) => state === "FAILED")) return "AI assessment failed";
  if (states.every((state) => state == null)) return "Submitted — not yet assessed";
  return "Processing";
}

export function bandForSection(rows: FullMockSectionResultBand[], section: (typeof SECTIONS)[number]): number | null {
  if (section === "WRITING") return writingBand(rows);
  const bands = rows
    .filter((r) => r.section === section)
    .map((r) => r.result?.bandScore ?? r.speakingSubmission?.bandScore ?? null)
    .filter((b): b is number => b != null);
  return average(bands);
}

/**
 * Real Overall Band, only ever returned once EVERY skill the mock includes
 * (all four by default; pass requiredSectionsFor(test) for the mock's real
 * composition) has a real band — never averaged from partial data.
 */
export function overallBandFromSections(rows: FullMockSectionResultBand[], required: readonly FullMockSectionKey[] = SECTIONS): number | null {
  if (required.length === 0) return null;
  const bands = required.map((section) => bandForSection(rows, section));
  return bands.every((b): b is number => b != null) ? roundToIeltsBand(average(bands as number[])!) : null;
}

const SECTION_LETTER: Record<FullMockSectionKey, string> = { LISTENING: "L", READING: "R", WRITING: "W", SPEAKING: "S" };

/**
 * Phase K - the label of the combined figure. It is NOT an official IELTS result (there is no Speaking in the mock, and the Writing band is a
 * teacher's mark in a practice sitting), so it always says which skills it is made of and that it is unofficial: "Overall (L/R/W, unofficial)".
 */
export function overallBandLabel(required: readonly FullMockSectionKey[]): string {
  return `Overall (${required.map((key) => SECTION_LETTER[key]).join("/")}, unofficial)`;
}
