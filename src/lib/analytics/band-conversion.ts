import type { SkillType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * A commonly published reference Academic IELTS conversion scale (out of 40),
 * offered as an optional one-click starting point for a teacher's own table
 * — never applied automatically. Teachers can edit or delete every row.
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
  ],
};

/**
 * Looks up the band for a raw score using the test author's own conversion
 * table. Returns null when the teacher hasn't configured a table (or no
 * range covers this score) — callers must treat that as "not available",
 * never fall back to a guess.
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
