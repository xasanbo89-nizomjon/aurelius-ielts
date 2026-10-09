import "server-only";

import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";
import { REVIEW_LEASE_SECONDS, REVIEW_MAX_IDLE_PASSES, REVIEW_STALE_PENDING_SECONDS } from "@/lib/review-content/queue";
import { generateForQuestion, loadSystemTest, needsContent, numberedRows, type SystemRow, type SystemTest } from "@/lib/review-content/generate";

/**
 * Phase M3 - the worker of the review-content job. Resumable and safe to run twice:
 *   - the job is CLAIMED with one conditional update (PENDING, or PROCESSING with a lease that has run out), so two workers never run the same test;
 *   - it only does what is still missing (`needsContent`), a few questions at a time, and stops at its time limit - a cut-off job goes back to PENDING and the next worker
 *     (the scheduled job, the teacher's button, the next publish) continues where it stopped;
 *   - one question failing never stops the others.
 */

const CONCURRENCY = 4;
/** After this many failures in a row (the AI service is down) the pass stops instead of spending the whole time on requests that fail. */
const MAX_CONSECUTIVE_FAILURES = 4;

export type PassResult = { claimed: boolean; status: "PENDING" | "PROCESSING" | "DONE" | "FAILED" | null; total: number; remaining: number; written: number; failed: number };

type Options = { /** Epoch ms after which no new question is started. */ deadline?: number; concurrency?: number; log?: (message: string) => void };

const unclaimed: PassResult = { claimed: false, status: null, total: 0, remaining: 0, written: 0, failed: 0 };

async function claim(testId: string): Promise<{ requestedById: string } | null> {
  const now = new Date();
  const taken = await prisma.reviewContentJob.updateMany({
    where: { mockTestId: testId, OR: [{ status: "PENDING" }, { status: "PROCESSING", leaseUntil: { lt: now } }] },
    data: { status: "PROCESSING", leaseUntil: new Date(now.getTime() + REVIEW_LEASE_SECONDS * 1000), attempts: { increment: 1 } },
  });
  if (taken.count === 0) return null;
  const job = await prisma.reviewContentJob.findUnique({ where: { mockTestId: testId }, select: { requestedById: true, startedAt: true } });
  if (job && !job.startedAt) await prisma.reviewContentJob.update({ where: { mockTestId: testId }, data: { startedAt: new Date() } });
  return job ? { requestedById: job.requestedById } : null;
}

/** The teacher the AI cost is written under: whoever published the test, else its author (a deleted teacher's usage cannot be attributed). */
async function costTeacher(requestedById: string, authorId: string): Promise<string | null> {
  const found = await prisma.teacherProfile.findFirst({ where: { id: { in: [requestedById, authorId] } }, select: { id: true } });
  return found?.id ?? null;
}

export async function processReviewJob(testId: string, options: Options = {}): Promise<PassResult> {
  const claimed = await claim(testId);
  if (!claimed) return unclaimed;
  const log = options.log ?? (() => undefined);
  const deadline = options.deadline ?? Date.now() + 100_000;

  const test = await loadSystemTest(testId);
  if (!test || (test.type !== "READING" && test.type !== "LISTENING")) {
    await prisma.reviewContentJob.update({ where: { mockTestId: testId }, data: { status: "FAILED", lastError: "The test is gone or is not a Reading / Listening test.", leaseUntil: null } });
    return { ...unclaimed, claimed: true, status: "FAILED" };
  }
  const teacherId = await costTeacher(claimed.requestedById, test.createdById);

  const rows = numberedRows(test);
  const todo = rows.filter(needsContent);
  await prisma.reviewContentJob.update({ where: { mockTestId: testId }, data: { totalQuestions: rows.length, doneQuestions: rows.length - todo.length } });
  log(`${test.title}: ${rows.length} questions, ${todo.length} to write`);

  let written = 0;
  let failed = 0;
  let consecutive = 0;
  let aborted: string | null = null;
  let next = 0;

  async function worker() {
    while (next < todo.length && !aborted && Date.now() < deadline) {
      const row = todo[next++];
      try {
        const outcome = await generateForQuestion(test as SystemTest, row as SystemRow, teacherId);
        written += outcome.evidenceStored > 0 || outcome.explanationStored ? 1 : 0;
        consecutive = 0;
        log(`  Q${row.startNumber}: evidence ${outcome.evidenceStored}, explanation ${outcome.explanationStored ? "written" : "kept"}`);
      } catch (error) {
        failed += 1;
        consecutive += 1;
        const message = error instanceof Error ? error.message : String(error);
        log(`  Q${row.startNumber}: FAILED ${message}`);
        if (consecutive >= MAX_CONSECUTIVE_FAILURES) aborted = message;
      }
      // keeps the lease and the progress figures fresh
      await prisma.reviewContentJob
        .update({ where: { mockTestId: testId }, data: { leaseUntil: new Date(Date.now() + REVIEW_LEASE_SECONDS * 1000), doneQuestions: rows.length - todo.length + Math.max(0, next - failed) } })
        .catch(() => undefined);
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(options.concurrency ?? CONCURRENCY, Math.max(1, todo.length)) }, () => worker()));
  } catch (error) {
    logServerError("review-content:pass", error);
    aborted = error instanceof Error ? error.message : String(error);
  }

  // What is left: questions not reached (time ran out), and the ones that failed.
  const reached = Math.min(next, todo.length);
  const remaining = todo.length - reached + failed;
  const finished = remaining === 0 && !aborted;
  const job = await prisma.reviewContentJob.findUnique({ where: { mockTestId: testId }, select: { attempts: true } });
  const idle = written === 0 && failed > 0;
  const status = finished ? "DONE" : idle && (job?.attempts ?? 0) >= REVIEW_MAX_IDLE_PASSES ? "FAILED" : "PENDING";
  await prisma.reviewContentJob.update({
    where: { mockTestId: testId },
    data: {
      status,
      leaseUntil: null,
      failedQuestions: failed,
      doneQuestions: rows.length - remaining,
      lastError: aborted ?? (failed > 0 ? `${failed} question${failed === 1 ? "" : "s"} could not be written` : null),
      completedAt: status === "DONE" ? new Date() : null,
      // a pass that made progress is not an idle one
      ...(written > 0 ? { attempts: 0 } : {}),
    },
  });
  return { claimed: true, status, total: rows.length, remaining, written, failed };
}

/** The scheduled job: continues jobs that nobody is working on (queued but never started, cut off by a time limit, or whose worker died). */
export async function processDue(options: { max: number; stopAfterMs: number; deadline?: number }): Promise<{ looked: number; done: number; written: number; failed: number }> {
  const startedAt = Date.now();
  const now = new Date();
  const jobs = await prisma.reviewContentJob.findMany({
    where: {
      OR: [
        { status: "PENDING", updatedAt: { lt: new Date(now.getTime() - REVIEW_STALE_PENDING_SECONDS * 1000) } },
        { status: "PROCESSING", leaseUntil: { lt: now } },
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: options.max,
    select: { mockTestId: true },
  });
  const tally = { looked: jobs.length, done: 0, written: 0, failed: 0 };
  for (const job of jobs) {
    if (Date.now() - startedAt >= options.stopAfterMs) break;
    const result = await processReviewJob(job.mockTestId, { deadline: options.deadline ?? startedAt + options.stopAfterMs });
    tally.written += result.written;
    tally.failed += result.failed;
    if (result.status === "DONE") tally.done += 1;
  }
  return tally;
}
