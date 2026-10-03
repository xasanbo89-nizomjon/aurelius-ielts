import type { SkillType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * The official Academic IELTS raw-score → band conversion (out of 40) for
 * Listening and Reading. This is what every completed paper is banded with
 * unless a teacher has set up their own table (see `resolveBandForScore`), and
 * it is also what the teacher's one-click "Load standard IELTS scale" seeds.
 * It runs all the way down to 0 so that no score is ever left without a band.
 */
export const STANDARD_BAND_SCALE: Record<Extract<SkillType, "READING" | "LISTENING">, { min: number; max: number; band: number }[]> = {
  READING: [
    { min: 39, max: 40, band: 9.0 },
    { min: 37, max: 38, band: 8.5 },
    { min: 35, max: 36, band: 8.0 },
    { min: 33, max: 34, band: 7.5 },
    { min: 30, max: 32, band: 7.0 },
    { min: 27, max: 29, band: 6.5 },
    { min: 23, max: 26, band: 6.0 },
    { min: 19, max: 22, band: 5.5 },
    { min: 15, max: 18, band: 5.0 },
    { min: 13, max: 14, band: 4.5 },
    { min: 10, max: 12, band: 4.0 },
    { min: 8, max: 9, band: 3.5 },
    { min: 6, max: 7, band: 3.0 },
    { min: 4, max: 5, band: 2.5 },
    { min: 3, max: 3, band: 2.0 },
    { min: 2, max: 2, band: 1.5 },
    { min: 1, max: 1, band: 1.0 },
    { min: 0, max: 0, band: 0 },
  ],
  LISTENING: [
    { min: 39, max: 40, band: 9.0 },
    { min: 37, max: 38, band: 8.5 },
    { min: 35, max: 36, band: 8.0 },
    { min: 32, max: 34, band: 7.5 },
    { min: 30, max: 31, band: 7.0 },
    { min: 26, max: 29, band: 6.5 },
    { min: 23, max: 25, band: 6.0 },
    { min: 18, max: 22, band: 5.5 },
    { min: 16, max: 17, band: 5.0 },
    { min: 13, max: 15, band: 4.5 },
    { min: 11, max: 12, band: 4.0 },
    { min: 8, max: 10, band: 3.5 },
    { min: 6, max: 7, band: 3.0 },
    { min: 4, max: 5, band: 2.5 },
    { min: 3, max: 3, band: 2.0 },
    { min: 2, max: 2, band: 1.5 },
    { min: 1, max: 1, band: 1.0 },
    { min: 0, max: 0, band: 0 },
  ],
};

/** The conversion tables are defined for a 40-question paper. */
export const BAND_TABLE_MAX_SCORE = 40;

/** Whether a paper's marks have to be scaled onto the 40-mark table (a hand-built practice test with, say, 10 questions). */
export function isScaledToTable(totalPoints: number): boolean {
  return totalPoints > 0 && totalPoints !== BAND_TABLE_MAX_SCORE;
}

/**
 * The official band for a raw score — pure and synchronous, so the result
 * pages, the teacher dashboards and the submission all agree. A paper that
 * isn't worth exactly 40 marks is scaled onto the 40-mark table first
 * (rounded to the nearest whole mark). Null only for skills the table doesn't
 * cover (Writing / Speaking) or a paper with no marks at all.
 */
export function officialBandForScore(skill: SkillType, rawScore: number, totalPoints: number = BAND_TABLE_MAX_SCORE): number | null {
  if (skill !== "READING" && skill !== "LISTENING") return null;
  if (!(totalPoints > 0) || !Number.isFinite(rawScore)) return null;

  const clamped = Math.min(Math.max(rawScore, 0), totalPoints);
  const onTable = isScaledToTable(totalPoints) ? Math.round((clamped / totalPoints) * BAND_TABLE_MAX_SCORE) : Math.round(clamped);
  const range = STANDARD_BAND_SCALE[skill].find((row) => onTable >= row.min && onTable <= row.max);
  return range?.band ?? null;
}

/**
 * Looks up the band for a raw score using the test author's OWN conversion
 * table, if they set one up. Null when they haven't (or no range of theirs
 * covers this score) — which is no longer the end of the story: see
 * `resolveBandForScore`.
 */
export async function getBandForScore(
  skill: SkillType,
  score: number,
  teacherId: string
): Promise<number | null> {
  const range = await prisma.bandConversionRange.findFirst({
    where: { createdById: teacherId, skill, minScore: { lte: score }, maxScore: { gte: score } },
    orderBy: { band: "desc" },
    select: { band: true },
  });
  return range?.band ?? null;
}

/**
 * The band a finished paper is given: the teacher's own table wins when they
 * have configured one that covers the score, otherwise the official IELTS
 * conversion. Always a number for Listening and Reading — a student never sees
 * "Not available yet" again.
 */
export async function resolveBandForScore(skill: SkillType, rawScore: number, totalPoints: number, teacherId: string): Promise<number | null> {
  const custom = await getBandForScore(skill, rawScore, teacherId);
  return custom ?? officialBandForScore(skill, rawScore, totalPoints);
}
