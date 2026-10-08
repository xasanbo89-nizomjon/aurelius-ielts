import { roundToIeltsBand } from "@/lib/analytics/band-rounding";
import { TASK_WEIGHT } from "@/lib/writing-assessment/constants";

/**
 * Phase O - the band arithmetic of a Writing assessment and of the "Students' Scores" page, pure.
 *
 *   criterion  Task Achievement / Response, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy: each 0-9 in half bands.
 *   task       the MEAN of its four criteria, rounded to the nearest half band the IELTS way (.25 up to .5, .75 up to the next whole band).
 *   Writing    (Task 1 + 2 x Task 2) / 3, again to the nearest half band, from the two task bands as they are shown. Only when both tasks have a band.
 *   Overall    the MEAN of Listening, Reading, Writing and Speaking, rounded the same way. Only when all four exist.
 *
 * The model is never asked for a task band or a Writing band: it marks the four criteria, and everything above is worked out here.
 */

export type Criteria = { taskResponse: number; coherence: number; lexical: number; grammar: number };

/** A criterion band as stored: kept in 0..9 and on the half-band grid. */
export function toCriterionBand(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(9, Math.max(0, Math.round(value * 2) / 2));
}

/** The band of one task: the mean of its four criteria, rounded the IELTS way. */
export function taskBandFromCriteria(criteria: Criteria): number {
  return roundToIeltsBand((criteria.taskResponse + criteria.coherence + criteria.lexical + criteria.grammar) / 4);
}

/** The Writing band: (Task 1 + 2 x Task 2) / 3 to the nearest half band, or null while either task has no band. */
export function writingBandFromTasks(task1: number | null | undefined, task2: number | null | undefined): number | null {
  if (typeof task1 !== "number" || typeof task2 !== "number") return null;
  return roundToIeltsBand((task1 * TASK_WEIGHT.task1 + task2 * TASK_WEIGHT.task2) / (TASK_WEIGHT.task1 + TASK_WEIGHT.task2));
}

/** A teacher's own mark of an essay, when there is one, stands in front of the AI estimate (the teacher is the authority; the AI is the default). */
export function effectiveTaskBand(teacherMark: number | null | undefined, aiBand: number | null | undefined): number | null {
  if (typeof teacherMark === "number") return teacherMark;
  return typeof aiBand === "number" ? aiBand : null;
}

export type SectionName = "Listening" | "Reading" | "Writing" | "Speaking";
export const SECTION_ORDER: readonly SectionName[] = ["Listening", "Reading", "Writing", "Speaking"];

export type SectionBands = { listening: number | null | undefined; reading: number | null | undefined; writing: number | null | undefined; speaking: number | null | undefined };

/**
 * The Overall band of the four skills, or null with the names of the skills still missing. Never an average of what exists: three skills give no Overall.
 * (6.125 -> 6.0, 6.25 -> 6.5, 6.75 -> 7.0.)
 */
export function overallFromSections(sections: SectionBands): { band: number | null; missing: SectionName[] } {
  const values: Record<SectionName, number | null | undefined> = { Listening: sections.listening, Reading: sections.reading, Writing: sections.writing, Speaking: sections.speaking };
  const missing = SECTION_ORDER.filter((name) => typeof values[name] !== "number");
  if (missing.length > 0) return { band: null, missing };
  const sum = SECTION_ORDER.reduce((total, name) => total + (values[name] as number), 0);
  return { band: roundToIeltsBand(sum / SECTION_ORDER.length), missing: [] };
}

/** "Missing: Writing and Speaking" for the tooltip on an Overall that cannot be worked out. */
export function missingText(missing: readonly SectionName[]): string {
  if (missing.length === 0) return "";
  if (missing.length === 1) return `Missing: ${missing[0]}`;
  return `Missing: ${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
}

/** 6.5 -> "6.5", 7 -> "7.0", null -> "—". */
export function bandText(band: number | null | undefined): string {
  return typeof band === "number" && Number.isFinite(band) ? band.toFixed(1) : "—";
}
