import { PROCESSING_LEASE_SECONDS } from "@/lib/speaking-audio/constants";

/**
 * Phase Q-B - the life of one recorded practice, pure:
 *
 *   AWAITING_UPLOAD -> PENDING -> PROCESSING -> DONE
 *                                     |
 *                                     +-> FAILED -> (Try again, same recording) -> PENDING
 *
 * A practice counts toward the daily limit once its recording has arrived (PENDING and later); a failed one that is tried again is the same practice, so it never
 * counts twice. A worker that dies leaves PROCESSING behind: it holds a lease, and a practice whose lease has run out is picked up again.
 */

export type PracticeStatus = "AWAITING_UPLOAD" | "PENDING" | "PROCESSING" | "DONE" | "FAILED";

export type FailureCode = "NO_SPEECH" | "AI_UNAVAILABLE" | "BAD_FORMAT" | "AUDIO_MISSING" | "AUDIO_INVALID" | "INTERRUPTED" | "INTERNAL";

export const STATUS_LABEL: Record<PracticeStatus, string> = {
  AWAITING_UPLOAD: "Recording not sent",
  PENDING: "Waiting to be assessed",
  PROCESSING: "Being assessed",
  DONE: "Assessed",
  FAILED: "Assessment failed",
};


/** What a student reads for each way an assessment can fail, and whether "Try again" (the same recording) can help. */
export const FAILURE_INFO: Record<FailureCode, { message: string; retry: boolean }> = {
  NO_SPEECH: { message: "We could not hear enough speech in this recording. Check your microphone, speak a little closer to it and record again.", retry: false },
  AI_UNAVAILABLE: { message: "The AI service did not answer. Your recording is safe - press Try again in a minute.", retry: true },
  BAD_FORMAT: { message: "The AI answered in an unexpected format. Press Try again.", retry: true },
  AUDIO_MISSING: { message: "Your recording did not reach the server. Record your answer again.", retry: false },
  AUDIO_INVALID: { message: "This recording could not be read. Record your answer again.", retry: false },
  INTERRUPTED: { message: "The assessment was interrupted. Press Try again.", retry: true },
  INTERNAL: { message: "Something went wrong on our side. Press Try again.", retry: true },
};

export const isFailureCode = (value: unknown): value is FailureCode => typeof value === "string" && value in FAILURE_INFO;

export function failureMessage(code: string | null | undefined, stored?: string | null): string {
  if (isFailureCode(code)) return FAILURE_INFO[code].message;
  return stored?.trim() || FAILURE_INFO.INTERNAL.message;
}

/** A failed practice can be assessed again from the stored recording unless the recording itself is the problem. */
export function canRetry(status: PracticeStatus, code: string | null | undefined): boolean {
  if (status !== "FAILED") return false;
  return isFailureCode(code) ? FAILURE_INFO[code].retry : true;
}

/** A PENDING practice that nobody has started after this long is started again (the worker that should have run never did). */
export const STALE_PENDING_SECONDS = 30;

export type Pickable = { status: PracticeStatus; updatedAt: Date; processingStartedAt: Date | null; attempts: number };

/** True when something should (re)start the assessment of this practice: lost PENDING, or PROCESSING whose lease has run out. */
export function needsWorker(row: Pickable, now: Date): boolean {
  if (row.status === "PENDING") return now.getTime() - row.updatedAt.getTime() > STALE_PENDING_SECONDS * 1000;
  if (row.status === "PROCESSING") {
    const started = row.processingStartedAt ?? row.updatedAt;
    return now.getTime() - started.getTime() > PROCESSING_LEASE_SECONDS * 1000;
  }
  return false;
}


/** How long a client waits between two looks at a running assessment: quick at first, slower once it has taken a while. */
export function pollDelayMs(elapsedMs: number): number {
  if (elapsedMs < 30_000) return 2000;
  if (elapsedMs < 120_000) return 4000;
  return 8000;
}

/** "42 s" for under a minute, "1 min 05 s" above it. */
export function waitText(elapsedMs: number): string {
  const seconds = Math.max(0, Math.round(elapsedMs / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}
