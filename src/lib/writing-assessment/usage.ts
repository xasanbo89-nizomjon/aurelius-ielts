import "server-only";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { LIMIT_TIME_ZONE } from "@/lib/speaking-audio/constants";
import { monthRange } from "@/lib/writing-assessment/limits";
import { fromMicroUsd } from "@/lib/writing-assessment/cost";
import type { MonthKey } from "@/lib/speaking-audio/usage";

/**
 * Phase O - what the AI assessment of Writing has used and (as an estimate) cost, for the Root Teacher, on the same usage page as the Speaking practice. Every number is an
 * aggregate of the usage log (`writing_assessment_runs`) and of the assessments themselves; nothing is made up. The cost is the log's own estimate (token counts the API
 * reported, multiplied by the list prices in cost.ts), so the page calls it an estimate. Root-only and platform-wide, so no per-teacher scope applies.
 */

export type WritingUsageByModel = { kind: string; model: string; calls: number; failedCalls: number; promptTokens: number; completionTokens: number; costUsd: number };
export type WritingUsageByDay = { day: string; assessments: number; costUsd: number };
export type WritingUsageByStudent = { studentId: string; name: string | null; email: string; assessments: number; costUsd: number };

export type WritingUsageReport = {
  month: MonthKey;
  start: Date;
  end: Date;
  assessments: { created: number; done: number; failed: number; waiting: number };
  totals: { calls: number; failedCalls: number; promptTokens: number; completionTokens: number; costUsd: number };
  /** The measured average cost of the most recent finished assessments (all their calls added up), or null when there are none. */
  averageCostPerAssessmentUsd: number | null;
  assessedSample: number;
  byModel: WritingUsageByModel[];
  byDay: WritingUsageByDay[];
  topStudents: WritingUsageByStudent[];
};

const TZ = Prisma.raw(`'${LIMIT_TIME_ZONE}'`);

export async function getWritingUsageReport(month: MonthKey): Promise<WritingUsageReport> {
  const { start, end } = monthRange(month.year, month.month);
  const inMonth = { createdAt: { gte: start, lt: end } };

  const [grouped, created, done, failed, waiting] = await Promise.all([
    prisma.writingAssessmentRun.groupBy({
      by: ["kind", "model", "ok"],
      where: inMonth,
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true, costMicroUsd: true },
    }),
    prisma.writingAssessment.count({ where: inMonth }),
    prisma.writingAssessment.count({ where: { status: "DONE", completedAt: { gte: start, lt: end } } }),
    prisma.writingAssessment.count({ where: { status: "FAILED", ...inMonth } }),
    prisma.writingAssessment.count({ where: { status: { in: ["PENDING", "PROCESSING"] }, ...inMonth } }),
  ]);

  const models = new Map<string, WritingUsageByModel>();
  const totals = { calls: 0, failedCalls: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 };
  for (const row of grouped) {
    const key = `${row.kind}|${row.model}`;
    const entry = models.get(key) ?? { kind: row.kind, model: row.model, calls: 0, failedCalls: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 };
    const calls = row._count._all;
    entry.calls += calls;
    if (!row.ok) entry.failedCalls += calls;
    entry.promptTokens += row._sum.promptTokens ?? 0;
    entry.completionTokens += row._sum.completionTokens ?? 0;
    entry.costUsd += fromMicroUsd(row._sum.costMicroUsd ?? 0);
    models.set(key, entry);

    totals.calls += calls;
    if (!row.ok) totals.failedCalls += calls;
    totals.promptTokens += row._sum.promptTokens ?? 0;
    totals.completionTokens += row._sum.completionTokens ?? 0;
    totals.costUsd += fromMicroUsd(row._sum.costMicroUsd ?? 0);
  }

  const dayRows = await prisma.$queryRaw<{ day: string; assessments: bigint; cost: bigint | null }[]>`
    SELECT d.day AS day, COALESCE(a.assessments, 0) AS assessments, COALESCE(c.cost, 0) AS cost
    FROM (
      SELECT to_char(("createdAt" AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') AS day, COUNT(*) AS assessments
      FROM writing_assessments WHERE "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1
    ) a
    FULL OUTER JOIN (
      SELECT to_char(("createdAt" AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') AS day, SUM("costMicroUsd") AS cost
      FROM writing_assessment_runs WHERE "createdAt" >= ${start} AND "createdAt" < ${end} GROUP BY 1
    ) c ON c.day = a.day
    CROSS JOIN LATERAL (SELECT COALESCE(a.day, c.day) AS day) d
    ORDER BY d.day`;
  const byDay = dayRows.map((row) => ({ day: row.day, assessments: Number(row.assessments), costUsd: fromMicroUsd(Number(row.cost ?? 0)) }));

  const studentRows = await prisma.$queryRaw<{ studentId: string; assessments: bigint; cost: bigint | null }[]>`
    SELECT a."studentId" AS "studentId", COUNT(DISTINCT a.id) AS assessments, SUM(r."costMicroUsd") AS cost
    FROM writing_assessment_runs r JOIN writing_assessments a ON a.id = r."assessmentId"
    WHERE r."createdAt" >= ${start} AND r."createdAt" < ${end}
    GROUP BY a."studentId" ORDER BY SUM(r."costMicroUsd") DESC NULLS LAST LIMIT 10`;
  const people = studentRows.length
    ? await prisma.studentProfile.findMany({ where: { id: { in: studentRows.map((row) => row.studentId) } }, select: { id: true, user: { select: { name: true, email: true } } } })
    : [];
  const topStudents: WritingUsageByStudent[] = studentRows.map((row) => {
    const person = people.find((candidate) => candidate.id === row.studentId);
    return { studentId: row.studentId, name: person?.user.name ?? null, email: person?.user.email ?? "(removed student)", assessments: Number(row.assessments), costUsd: fromMicroUsd(Number(row.cost ?? 0)) };
  });

  // What one assessment costs in practice: all the calls of each of the latest finished assessments, added up and averaged (a measurement, not a price list).
  const sample = await prisma.$queryRaw<{ assessments: bigint; average: number | null }[]>`
    SELECT COUNT(*) AS assessments, AVG(t.cost)::float8 AS average FROM (
      SELECT SUM(r."costMicroUsd") AS cost
      FROM writing_assessment_runs r
      WHERE r."assessmentId" IN (SELECT id FROM writing_assessments WHERE status = 'DONE' ORDER BY "completedAt" DESC LIMIT 50)
      GROUP BY r."assessmentId"
    ) t`;
  const assessedSample = Number(sample[0]?.assessments ?? 0);
  const averageCostPerAssessmentUsd = assessedSample > 0 && sample[0]?.average != null ? fromMicroUsd(sample[0].average) : null;

  return {
    month,
    start,
    end,
    assessments: { created, done, failed, waiting },
    totals,
    averageCostPerAssessmentUsd,
    assessedSample,
    byModel: [...models.values()].sort((a, b) => b.costUsd - a.costUsd),
    byDay,
    topStudents,
  };
}
