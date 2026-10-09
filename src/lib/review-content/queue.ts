import "server-only";
import { after } from "next/server";

import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/error-logger";

/**
 * Phase M3 - getting a published test into the review-content queue. Publishing is never held up by any of this: the job row is made (one per test, reused when the
 * test is published again or the backfill runs), then a worker is started in the background after the response has been sent - or, outside a request (a script, the
 * scheduled job), left PENDING for the scheduled job and for the teacher's "Write again" button.
 */

/** A worker that holds a job longer than this without finishing is taken to have died: the job is picked up again. */
export const REVIEW_LEASE_SECONDS = 4 * 60;
/** A PENDING job nobody has started after this long is started again (the worker that should have run never did). */
export const REVIEW_STALE_PENDING_SECONDS = 45;
/** Passes that made no progress at all before the job is shown as failed (a teacher can still queue it again). */
export const REVIEW_MAX_IDLE_PASSES = 3;

/** Reading and Listening tests that students sit on their own. A section built for a Full Mock package is never reviewed by a student (its results are hidden), so it is left out. */
export async function isReviewable(testId: string): Promise<boolean> {
  const test = await prisma.mockTest.findUnique({ where: { id: testId }, select: { type: true, packageFullMockTestId: true } });
  return !!test && (test.type === "READING" || test.type === "LISTENING") && !test.packageFullMockTestId;
}

/** Makes (or wakes up) the job of a test. Returns false when the test is not one that gets review content. */
export async function queueReviewContent(testId: string, requestedById: string): Promise<boolean> {
  if (!(await isReviewable(testId))) return false;
  await prisma.reviewContentJob.upsert({
    where: { mockTestId: testId },
    create: { mockTestId: testId, requestedById },
    // A job that is running keeps running; one that finished or failed starts again (it only does what is still missing).
    update: { status: "PENDING", attempts: 0, lastError: null, completedAt: null, leaseUntil: null, requestedById },
  });
  return true;
}

/** Starts the worker after the response has been sent. Never throws. */
export function startReviewContentInBackground(testId: string, run: (testId: string) => Promise<unknown>): void {
  const work = async () => {
    try {
      await run(testId);
    } catch (error) {
      logServerError("review-content:background", error);
    }
  };
  try {
    after(work);
  } catch {
    // not inside a request: left for the scheduled job
  }
}

export type ReviewJobView = { status: "PENDING" | "PROCESSING" | "DONE" | "FAILED"; totalQuestions: number; doneQuestions: number; failedQuestions: number; lastError: string | null; updatedAt: Date };

export async function getReviewJob(testId: string): Promise<ReviewJobView | null> {
  return prisma.reviewContentJob.findUnique({ where: { mockTestId: testId }, select: { status: true, totalQuestions: true, doneQuestions: true, failedQuestions: true, lastError: true, updatedAt: true } });
}
