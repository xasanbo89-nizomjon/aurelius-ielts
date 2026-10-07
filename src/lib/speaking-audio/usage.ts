import "server-only";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { LIMIT_TIME_ZONE } from "@/lib/speaking-audio/constants";
import { localDate, monthRange } from "@/lib/speaking-audio/limits";
import { fromMicroUsd } from "@/lib/speaking-audio/cost";

/**
 * Phase Q-B - what the AI side of the Speaking practice has used and (as an estimate) cost, for the Root Teacher. Every number is an aggregate of the usage log
 * (`speaking_audio_runs`) and of the practices themselves; nothing is made up. The cost is the log's own estimate (token and audio-minute counts the API reported,
 * multiplied by the list prices in cost.ts), so the page calls it an estimate. The page is Root-only and platform-wide, so no per-teacher scope applies to these queries.
 */

export type MonthKey = { year: number; month: number };

/** "2026-10" -> { year, month }; anything else (or no value) -> the current month in the students' time zone. */
export function parseMonth(value: string | undefined, now = new Date()): MonthKey {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (year >= 2024 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  }
  const today = localDate(LIMIT_TIME_ZONE, now);
  return { year: today.year, month: today.month };
}

export const monthValue = (key: MonthKey): string => `${key.year}-${String(key.month).padStart(2, "0")}`;

export function shiftMonth(key: MonthKey, by: number): MonthKey {
  const index = key.year * 12 + (key.month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export type UsageByModel = { kind: string; model: string; calls: number; failedCalls: number; promptTokens: number; completionTokens: number; audioInputTokens: number; audioMinutes: number; costUsd: number };
export type UsageByDay = { day: string; practices: number; costUsd: number };
export type UsageByStudent = { studentId: string; name: string | null; email: string; practices: number; costUsd: number };

export type UsageReport = {
  month: MonthKey;
  start: Date;
  end: Date;
  practices: { submitted: number; assessed: number; failed: number; waiting: number };
  totals: { calls: number; failedCalls: number; promptTokens: number; completionTokens: number; audioInputTokens: number; transcribedMinutes: number; costUsd: number };
  /** The measured average cost of the most recent assessed practices (all their calls added up), or null when there are none. */
  averageCostPerAssessmentUsd: number | null;
  assessedSample: number;
  byModel: UsageByModel[];
  byDay: UsageByDay[];
  topStudents: UsageByStudent[];
};

const TZ = Prisma.raw(`'${LIMIT_TIME_ZONE}'`);

export async function getUsageReport(month: MonthKey): Promise<UsageReport> {
  const { start, end } = monthRange(month.year, month.month);
  const inMonth = { createdAt: { gte: start, lt: end } };

  const [grouped, submitted, assessed, failed, waiting] = await Promise.all([
    prisma.speakingAudioRun.groupBy({
      by: ["kind", "model", "ok"],
      where: inMonth,
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true, audioInputTokens: true, audioSeconds: true, costMicroUsd: true },
    }),
    prisma.speakingAudioPractice.count({ where: { submittedAt: { gte: start, lt: end } } }),
    prisma.speakingAudioPractice.count({ where: { status: "DONE", completedAt: { gte: start, lt: end } } }),
    prisma.speakingAudioPractice.count({ where: { status: "FAILED", submittedAt: { gte: start, lt: end } } }),
    prisma.speakingAudioPractice.count({ where: { status: { in: ["PENDING", "PROCESSING"] }, submittedAt: { gte: start, lt: end } } }),
  ]);

  const models = new Map<string, UsageByModel>();
  const totals = { calls: 0, failedCalls: 0, promptTokens: 0, completionTokens: 0, audioInputTokens: 0, transcribedMinutes: 0, costUsd: 0 };
  for (const row of grouped) {
    const key = `${row.kind}|${row.model}`;
    const entry = models.get(key) ?? { kind: row.kind, model: row.model, calls: 0, failedCalls: 0, promptTokens: 0, completionTokens: 0, audioInputTokens: 0, audioMinutes: 0, costUsd: 0 };
    const calls = row._count._all;
    entry.calls += calls;
    if (!row.ok) entry.failedCalls += calls;
    entry.promptTokens += row._sum.promptTokens ?? 0;
    entry.completionTokens += row._sum.completionTokens ?? 0;
    entry.audioInputTokens += row._sum.audioInputTokens ?? 0;
    const minutes = row.ok ? (row._sum.audioSeconds ?? 0) / 60 : 0;
    entry.audioMinutes += minutes;
    entry.costUsd += fromMicroUsd(row._sum.costMicroUsd ?? 0);
    models.set(key, entry);

    totals.calls += calls;
    if (!row.ok) totals.failedCalls += calls;
    totals.promptTokens += row._sum.promptTokens ?? 0;
    totals.completionTokens += row._sum.completionTokens ?? 0;
    totals.audioInputTokens += row._sum.audioInputTokens ?? 0;
    if (row.kind === "TRANSCRIBE") totals.transcribedMinutes += minutes;
    totals.costUsd += fromMicroUsd(row._sum.costMicroUsd ?? 0);
  }

  const dayRows = await prisma.$queryRaw<{ day: string; practices: bigint; cost: bigint | null }[]>`
    SELECT d.day AS day, COALESCE(p.practices, 0) AS practices, COALESCE(c.cost, 0) AS cost
    FROM (
      SELECT to_char(("submittedAt" AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') AS day, COUNT(*) AS practices
      FROM speaking_audio_practices WHERE "submittedAt" >= ${start} AND "submittedAt" < ${end} GROUP BY 1
    ) p
    FULL OUTER JOIN (
      SELECT to_char(("createdAt" AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') AS day, SUM("costMicroUsd") AS cost
      FROM speaking_audio_runs WHERE "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1
    ) c ON c.day = p.day
    CROSS JOIN LATERAL (SELECT COALESCE(p.day, c.day) AS day) d
    ORDER BY d.day`;
  const byDay = dayRows.map((row) => ({ day: row.day, practices: Number(row.practices), costUsd: fromMicroUsd(Number(row.cost ?? 0)) }));

  const studentRows = await prisma.$queryRaw<{ studentId: string; practices: bigint; cost: bigint | null }[]>`
    SELECT p."studentId" AS "studentId", COUNT(DISTINCT p.id) AS practices, SUM(r."costMicroUsd") AS cost
    FROM speaking_audio_runs r JOIN speaking_audio_practices p ON p.id = r."practiceId"
    WHERE r."createdAt" >= ${start} AND r."createdAt" < ${end}
    GROUP BY p."studentId" ORDER BY SUM(r."costMicroUsd") DESC NULLS LAST LIMIT 10`;
  const people = studentRows.length
    ? await prisma.studentProfile.findMany({ where: { id: { in: studentRows.map((row) => row.studentId) } }, select: { id: true, user: { select: { name: true, email: true } } } })
    : [];
  const topStudents: UsageByStudent[] = studentRows.map((row) => {
    const person = people.find((candidate) => candidate.id === row.studentId);
    return { studentId: row.studentId, name: person?.user.name ?? null, email: person?.user.email ?? "(removed student)", practices: Number(row.practices), costUsd: fromMicroUsd(Number(row.cost ?? 0)) };
  });

  // What one assessment costs in practice: all the calls of each of the latest assessed practices, added up and averaged (a measurement, not a price list).
  const sample = await prisma.$queryRaw<{ practices: bigint; average: number | null }[]>`
    SELECT COUNT(*) AS practices, AVG(t.cost)::float8 AS average FROM (
      SELECT SUM(r."costMicroUsd") AS cost
      FROM speaking_audio_runs r
      WHERE r."practiceId" IN (SELECT id FROM speaking_audio_practices WHERE status = 'DONE' ORDER BY "completedAt" DESC LIMIT 50)
      GROUP BY r."practiceId"
    ) t`;
  const assessedSample = Number(sample[0]?.practices ?? 0);
  const averageCostPerAssessmentUsd = assessedSample > 0 && sample[0]?.average != null ? fromMicroUsd(sample[0].average) : null;

  return {
    month,
    start,
    end,
    practices: { submitted, assessed, failed, waiting },
    totals,
    averageCostPerAssessmentUsd,
    assessedSample,
    byModel: [...models.values()].sort((a, b) => b.costUsd - a.costUsd),
    byDay,
    topStudents,
  };
}
