import type { SkillType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { STANDARD_BAND_SCALE } from "@/lib/analytics/band-conversion";

export async function listBandRanges(teacherId: string) {
  return prisma.bandConversionRange.findMany({
    where: { createdById: teacherId },
    orderBy: [{ skill: "asc" }, { minScore: "desc" }],
  });
}

function assertValidRange(minScore: number, maxScore: number) {
  if (minScore < 0 || maxScore < 0) throw new Error("Scores can't be negative.");
  if (minScore > maxScore) throw new Error("Minimum score can't be greater than maximum score.");
}

async function assertNoOverlap(
  teacherId: string,
  skill: SkillType,
  minScore: number,
  maxScore: number,
  excludeId?: string
) {
  const overlapping = await prisma.bandConversionRange.findFirst({
    where: {
      createdById: teacherId,
      skill,
      id: excludeId ? { not: excludeId } : undefined,
      minScore: { lte: maxScore },
      maxScore: { gte: minScore },
    },
  });
  if (overlapping) {
    throw new Error(
      `That range overlaps an existing one (${overlapping.minScore}-${overlapping.maxScore} → band ${overlapping.band}).`
    );
  }
}

export async function createBandRange(
  teacherId: string,
  input: { skill: SkillType; minScore: number; maxScore: number; band: number }
) {
  assertValidRange(input.minScore, input.maxScore);
  await assertNoOverlap(teacherId, input.skill, input.minScore, input.maxScore);

  return prisma.bandConversionRange.create({
    data: { ...input, createdById: teacherId },
  });
}

export async function updateBandRange(
  rangeId: string,
  teacherId: string,
  input: { minScore: number; maxScore: number; band: number }
) {
  const existing = await prisma.bandConversionRange.findFirst({ where: { id: rangeId, createdById: teacherId } });
  if (!existing) throw new Error("Range not found.");

  assertValidRange(input.minScore, input.maxScore);
  await assertNoOverlap(teacherId, existing.skill, input.minScore, input.maxScore, rangeId);

  return prisma.bandConversionRange.update({ where: { id: rangeId }, data: input });
}

export async function deleteBandRange(rangeId: string, teacherId: string) {
  await prisma.bandConversionRange.deleteMany({ where: { id: rangeId, createdById: teacherId } });
}

/** Replaces a teacher's table for one skill with the standard reference scale. */
export async function loadStandardScale(teacherId: string, skill: Extract<SkillType, "READING" | "LISTENING">) {
  const rows = STANDARD_BAND_SCALE[skill];

  await prisma.$transaction([
    prisma.bandConversionRange.deleteMany({ where: { createdById: teacherId, skill } }),
    prisma.bandConversionRange.createMany({
      data: rows.map((row) => ({
        createdById: teacherId,
        skill,
        minScore: row.min,
        maxScore: row.max,
        band: row.band,
      })),
    }),
  ]);
}
