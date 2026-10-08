import "server-only";

import { logServerError } from "@/lib/error-logger";
import { writingTaskShownToStudent } from "@/lib/exam/result-visibility";
import { enqueueAssessment, startInBackground } from "@/lib/writing-assessment/queue";
import { processAssessment } from "@/lib/writing-assessment/processing";

/** Where a student goes after handing in a Writing test whose results are hidden from them (or a Full Mock). */
export const WRITING_SUBMITTED_HREF = "/student/submitted?for=writing";

export type HandInQueued = {
  /** The assessment of this sitting, or null when there is none (nothing to assess, or the queue could not be reached - the essays are safe either way). */
  assessmentId: string | null;
  /** The page to show next: the combined report when the results are shown to the student, otherwise "Your test has been submitted." */
  nextHref: string;
};

/**
 * Phase O - called when the essays of a Writing sitting have been handed in and stored: puts the sitting in the AI assessment queue (idempotent - handing in twice makes
 * one assessment) and, when `kick` is set, starts the worker in the background so the student is not kept waiting. A sitting the server handed in by itself (the clock ran
 * out while nobody was there) is queued but not kicked: the scheduled job, or whoever next opens the page, starts it.
 *
 * NEVER throws and never delays the hand-in: a queue that cannot be reached is logged, and the assessment can still be started later from the teacher's page.
 */
export async function queueAfterHandIn(input: { studentId: string; submissionIds: string[]; fullMockAttemptId?: string | null; taskId: string | null; kick: boolean; fallbackSubmissionId?: string }): Promise<HandInQueued> {
  let assessmentId: string | null = null;
  try {
    const queued = await enqueueAssessment({ studentId: input.studentId, fullMockAttemptId: input.fullMockAttemptId ?? null, submissionIds: input.submissionIds });
    assessmentId = queued?.id ?? null;
    if (assessmentId && input.kick) startInBackground(assessmentId, (id) => processAssessment(id));
  } catch (error) {
    logServerError("writing-assessment:enqueue", error);
  }

  let shown = false;
  try {
    shown = input.fullMockAttemptId ? false : await writingTaskShownToStudent(input.taskId);
  } catch (error) {
    logServerError("writing-assessment:visibility", error);
    shown = false; // when in doubt, show nothing
  }
  if (!shown) return { assessmentId, nextHref: WRITING_SUBMITTED_HREF };
  if (assessmentId) return { assessmentId, nextHref: `/student/writing/assessment/${assessmentId}` };
  return { assessmentId, nextHref: input.fallbackSubmissionId ? `/student/writing/${input.fallbackSubmissionId}` : "/student/writing/tasks" };
}
