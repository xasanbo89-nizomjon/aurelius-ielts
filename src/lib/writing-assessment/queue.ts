import "server-only";
import { after } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { taskKeyOfType } from "@/lib/writing-assessment/constants";
import { DEFAULT_DAILY_WRITING_ASSESSMENTS, WRITING_LIMIT_SETTING_KEY } from "@/lib/writing-assessment/constants";
import { effectiveWritingLimit, nextDayStart, startOfDay } from "@/lib/writing-assessment/limits";

/**
 * Phase O - getting a Writing sitting into the assessment queue, and the daily limit. The hand-in itself is never touched by any of this: the essays are stored first,
 * then ONE assessment row is made for the sitting (idempotent: handing in twice, or a retry of the whole hand-in, finds the row that is already there), then a worker is
 * started in the background (`after`) - or, for a sitting the server handed in by itself, left for the scheduled job and for whoever opens the page.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export type EnqueueInput = {
  studentId: string;
  /** The Full Mock sitting the paper belongs to, if any. */
  fullMockAttemptId?: string | null;
  /** The submissions of the sitting, by their taskType ("Task 1" / "Task 2"). */
  submissionIds: string[];
};

export type Enqueued = { id: string; created: boolean };

/**
 * Makes (or finds) the assessment of a sitting from the essays that were handed in. Null when there is nothing to assess (no essay of this student that is handed in).
 */
export async function enqueueAssessment(input: EnqueueInput): Promise<Enqueued | null> {
  const submissions = await prisma.writingSubmission.findMany({
    where: { id: { in: input.submissionIds }, studentId: input.studentId, status: { not: "DRAFT" } },
    select: { id: true, taskType: true },
  });
  const task1 = submissions.find((row) => taskKeyOfType(row.taskType) === "task1")?.id ?? null;
  const task2 = submissions.find((row) => taskKeyOfType(row.taskType) === "task2")?.id ?? null;
  if (!task1 && !task2) return null;

  const alternatives: Prisma.WritingAssessmentWhereInput[] = [];
  if (input.fullMockAttemptId) alternatives.push({ fullMockAttemptId: input.fullMockAttemptId });
  if (task1) alternatives.push({ task1SubmissionId: task1 });
  if (task2) alternatives.push({ task2SubmissionId: task2 });
  const existing = await prisma.writingAssessment.findFirst({ where: { OR: alternatives }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };

  try {
    const created = await prisma.writingAssessment.create({
      data: { studentId: input.studentId, fullMockAttemptId: input.fullMockAttemptId ?? null, task1SubmissionId: task1, task2SubmissionId: task2 },
      select: { id: true },
    });
    return { id: created.id, created: true };
  } catch (error) {
    // Two hand-ins at the same moment made the row: the other one wins, this one finds it.
    if ((error as { code?: string }).code === "P2002") {
      const now = await prisma.writingAssessment.findFirst({ where: { OR: alternatives }, select: { id: true } });
      if (now) return { id: now.id, created: false };
    }
    throw error;
  }
}

/**
 * Starts the worker for an assessment after the response has been sent (so the student is never kept waiting). Outside a request (a script, the scheduled job) there is
 * nothing to hang the work on: it is simply left PENDING for the job and for the pages that look at it. Never throws.
 */
export function startInBackground(id: string, run: (id: string) => Promise<unknown>): void {
  const work = async () => {
    try {
      await run(id);
    } catch (error) {
      logServerError("writing-assessment:background", error);
    }
  };
  try {
    after(work);
  } catch {
    // not inside a request: left for the scheduled job
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------- the daily limit

export async function getWritingDailyLimit(): Promise<number> {
  const row = await prisma.platformSetting.findUnique({ where: { key: WRITING_LIMIT_SETTING_KEY }, select: { value: true } });
  return effectiveWritingLimit(row ? Number(row.value) : null);
}

/** Today's count for a student: assessments made today, not counting the one being run or those refused for the limit itself. */
export async function assessmentsUsedToday(db: Db, studentId: string, now: Date, exceptId?: string, before?: Date): Promise<number> {
  return db.writingAssessment.count({
    // `failureCode: { not: "LIMIT" }` alone would leave out the rows whose code is NULL (SQL: NULL <> 'LIMIT' is not true), so the two cases are spelled out.
    // `before`: only the sittings queued BEFORE this one count against it - the later of two waiting sittings is the one that waits for tomorrow, never the earlier.
    where: { studentId, createdAt: { gte: startOfDay(now), ...(before ? { lt: before } : {}) }, ...(exceptId ? { id: { not: exceptId } } : {}), OR: [{ failureCode: null }, { failureCode: { not: "LIMIT" } }] },
  });
}

export async function setWritingDailyLimit(limit: number, byTeacherId: string): Promise<number> {
  if (!Number.isFinite(limit)) throw new Error("The limit must be a number.");
  const value = effectiveWritingLimit(limit);
  await prisma.platformSetting.upsert({
    where: { key: WRITING_LIMIT_SETTING_KEY },
    create: { key: WRITING_LIMIT_SETTING_KEY, value: String(value), updatedById: byTeacherId },
    update: { value: String(value), updatedById: byTeacherId },
  });
  return value;
}

export { DEFAULT_DAILY_WRITING_ASSESSMENTS, nextDayStart };
