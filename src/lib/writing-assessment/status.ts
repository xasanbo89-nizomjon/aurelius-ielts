import { WRITING_LEASE_SECONDS, WRITING_STALE_PENDING_SECONDS } from "@/lib/writing-assessment/constants";

export { pollDelayMs, waitText } from "@/lib/speaking-audio/status";

/**
 * Phase O - the life of one Writing assessment, pure:
 *
 *   PENDING -> PROCESSING -> DONE
 *                  |
 *                  +-> FAILED -> (Try again, same essays, no new hand-in) -> PENDING
 *
 * A worker that dies leaves PROCESSING behind: it holds a lease, and an assessment whose lease has run out is picked up again. The essays are handed in and safe
 * whatever happens here - the assessment only adds the report.
 */

export type AssessmentStatus = "PENDING" | "PROCESSING" | "DONE" | "FAILED";

export type FailureCode = "AI_UNAVAILABLE" | "BAD_FORMAT" | "LIMIT" | "PICTURE_MISSING" | "INTERRUPTED" | "NO_ESSAY" | "INTERNAL";

export const STATUS_LABEL: Record<AssessmentStatus, string> = {
  PENDING: "Waiting to be assessed",
  PROCESSING: "Being assessed",
  DONE: "Assessed",
  FAILED: "Assessment failed",
};

/** What is read for each way an assessment can fail, and whether "Try again" (on the same essays) can help. */
export const FAILURE_INFO: Record<FailureCode, { message: string; retry: boolean }> = {
  AI_UNAVAILABLE: { message: "The AI service did not answer. The writing is safe - try again in a minute.", retry: true },
  BAD_FORMAT: { message: "The AI answered in an unexpected format. Try again.", retry: true },
  LIMIT: { message: "The daily limit of AI assessments has been reached. Try again tomorrow, or ask the Root Teacher to raise the limit.", retry: true },
  PICTURE_MISSING: { message: "The picture of Task 1 could not be loaded for the assessment. Try again; if it keeps failing, the teacher needs to upload the picture again.", retry: true },
  INTERRUPTED: { message: "The assessment was interrupted. Try again.", retry: true },
  NO_ESSAY: { message: "The essays of this sitting could not be found.", retry: false },
  INTERNAL: { message: "Something went wrong on our side. Try again.", retry: true },
};

export const isFailureCode = (value: unknown): value is FailureCode => typeof value === "string" && value in FAILURE_INFO;

export function failureMessage(code: string | null | undefined, stored?: string | null): string {
  if (isFailureCode(code)) return FAILURE_INFO[code].message;
  return stored?.trim() || FAILURE_INFO.INTERNAL.message;
}

/** A failed assessment can be run again from the stored essays unless the essays themselves are the problem. */
export function canRetry(status: AssessmentStatus, code: string | null | undefined): boolean {
  if (status !== "FAILED") return false;
  return isFailureCode(code) ? FAILURE_INFO[code].retry : true;
}

export type Pickable = { status: AssessmentStatus; updatedAt: Date; processingStartedAt: Date | null };

/** True when something should (re)start this assessment: a lost PENDING one, or a PROCESSING one whose lease has run out. */
export function needsWorker(row: Pickable, now: Date): boolean {
  if (row.status === "PENDING") return now.getTime() - row.updatedAt.getTime() > WRITING_STALE_PENDING_SECONDS * 1000;
  if (row.status === "PROCESSING") {
    const started = row.processingStartedAt ?? row.updatedAt;
    return now.getTime() - started.getTime() > WRITING_LEASE_SECONDS * 1000;
  }
  return false;
}

/** Waiting or running: the report is not there yet, and a screen should keep asking. */
export const isOpen = (status: AssessmentStatus): boolean => status === "PENDING" || status === "PROCESSING";
