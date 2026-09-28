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

export type CoinTrendPoint = { weekLabel: string; net: number };

function weekLabel(date: Date): string {
  const d = new Date(date);
  const diffToMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** Real net coin flow (earned minus spent) per week for one student, over the last N weeks — a real CoinTransaction sum, not the running wallet balance (which would hide weeks of zero activity as a flat line). */
export async function getStudentCoinTrend(studentId: string, weeks = 8): Promise<CoinTrendPoint[]> {
  const start = new Date();
  start.setDate(start.getDate() - weeks * 7);

  const transactions = await prisma.coinTransaction.findMany({
    where: { studentId, createdAt: { gte: start } },
    select: { amount: true, createdAt: true },
  });

  const byWeek = new Map<string, number>();
  for (const week of [...Array(weeks).keys()]) {
    const d = new Date();
    d.setDate(d.getDate() - week * 7);
    byWeek.set(weekLabel(d), 0);
  }
  for (const tx of transactions) {
    const label = weekLabel(tx.createdAt);
    byWeek.set(label, (byWeek.get(label) ?? 0) + tx.amount);
  }

  return [...byWeek.entries()].map(([weekLabel, net]) => ({ weekLabel, net })).sort((a, b) => a.weekLabel.localeCompare(b.weekLabel));
}
