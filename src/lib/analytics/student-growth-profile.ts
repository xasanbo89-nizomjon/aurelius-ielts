import "server-only";

import { prisma } from "@/lib/prisma";

export type BandTrendPoint = { x: number; y: number; date: Date };

/** Real per-student Writing band history — one point per AI-analyzed submission, in submission order. */
export async function getWritingBandTrend(studentId: string, limit = 50): Promise<BandTrendPoint[]> {
  const rows = await prisma.writingAnalysis.findMany({
    where: { submission: { studentId, status: { not: "DRAFT" } } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { estimatedBand: true, createdAt: true },
  });
  return rows.map((r, i) => ({ x: i + 1, y: r.estimatedBand, date: r.createdAt }));
}

/** Real per-student Speaking band history — one point per AI-evaluated attempt (Phase 27), in evaluation order. */
export async function getSpeakingBandTrend(studentId: string, limit = 50): Promise<BandTrendPoint[]> {
  const rows = await prisma.speakingSubmission.findMany({
    where: { studentId, status: "REVIEWED", bandScore: { not: null } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { bandScore: true, evaluatedAt: true, createdAt: true },
  });
  return rows.map((r, i) => ({ x: i + 1, y: r.bandScore as number, date: r.evaluatedAt ?? r.createdAt }));
}

