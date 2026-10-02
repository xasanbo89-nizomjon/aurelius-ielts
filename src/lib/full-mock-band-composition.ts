import "server-only";

import { roundToIeltsBand } from "@/lib/analytics/band-rounding";

/**
 * Phase 47 — the one real band-composition helper, replacing what had
 * become three separate copies (full-mock-results.ts, full-mock-analytics.ts,
 * and this phase's new full-mock-dashboard.ts) of the same "average the real
 * linked submissions per section, then average those into an Overall Band"
 * logic. Listening/Reading only ever have one FullMockSectionResult row, so
 * averaging "matches of length 1" still returns that row's own real
 * Result.bandScore unchanged — the same function correctly handles Writing/
 * Speaking's multiple rows (Task 1+2, Part 1+2+3) too.
 */
export type FullMockSectionResultBand = {
  section: string;
  result: { bandScore: number | null } | null;
  writingSubmission: { bandScore: number | null } | null;
  speakingSubmission: { bandScore: number | null } | null;
};

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

export function bandForSection(rows: FullMockSectionResultBand[], section: (typeof SECTIONS)[number]): number | null {
  const bands = rows
    .filter((r) => r.section === section)
    .map((r) => r.result?.bandScore ?? r.writingSubmission?.bandScore ?? r.speakingSubmission?.bandScore ?? null)
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
