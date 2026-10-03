import "server-only";

import { roundToIeltsBand } from "@/lib/analytics/band-rounding";

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
 * a band (the teacher's mark when there is one, otherwise the AI marker's
 * estimate) and Task 2 counts DOUBLE — Writing = (Task 1 + 2 × Task 2) / 3,
 * rounded to the nearest half band. A Writing band exists only once EVERY task
 * handed in has a band; one still waiting to be marked means "not yet", never a
 * half-finished average.
 */
export type FullMockSectionResultBand = {
  section: string;
  result: { bandScore: number | null } | null;
  writingSubmission: { bandScore: number | null; taskType?: string | null; analysis?: { estimatedBand: number } | null } | null;
  speakingSubmission: { bandScore: number | null } | null;
};

/** The columns every Full Mock band calculation reads — one definition, so every dashboard and result page composes bands from identical data. */
export const FULL_MOCK_SECTION_BAND_SELECT = {
  section: true,
  result: { select: { bandScore: true } },
  writingSubmission: { select: { bandScore: true, taskType: true, analysis: { select: { estimatedBand: true } } } },
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

/** One Writing task's band: the teacher's mark if there is one, otherwise the AI marker's estimate. */
export function writingTaskBand(submission: WritingSubmissionBand): number | null {
  return submission.bandScore ?? submission.analysis?.estimatedBand ?? null;
}

/** True when a Writing band (or part of it) is the AI marker's estimate and no teacher has marked that task yet — shown to students as "estimated". */
export function writingBandIsEstimate(rows: FullMockSectionResultBand[]): boolean {
  return rows.some((r) => r.section === "WRITING" && r.writingSubmission && r.writingSubmission.bandScore == null && r.writingSubmission.analysis != null);
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
 * running), "1 of 2 tasks submitted", "Submitted — awaiting grading",
 * "Submitted — AI estimate" (every task has the AI marker's band, no teacher
 * mark yet) or "Graded". null when the mock has no Writing section.
 */
export function writingProgressLabel(args: {
  taskCount: number;
  started: boolean;
  rows: { section: string; writingSubmission: { status: string; bandScore: number | null; analysis?: { estimatedBand: number } | null } | null }[];
}): string | null {
  if (args.taskCount <= 0) return null;
  const submitted = args.rows.filter((r) => r.section === "WRITING" && r.writingSubmission && r.writingSubmission.status !== "DRAFT");
  if (submitted.length === 0) return args.started ? "In progress" : "Not started";
  if (submitted.length < args.taskCount) return `${submitted.length} of ${args.taskCount} tasks submitted`;
  if (submitted.every((r) => r.writingSubmission!.bandScore != null)) return "Graded";
  if (submitted.every((r) => writingTaskBand(r.writingSubmission!) != null)) return "Submitted — AI estimate";
  return "Submitted — awaiting grading";
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
