"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireTeacherProfile } from "@/lib/session";
import { logServerError } from "@/lib/error-logger";
import { retryAssessment } from "@/lib/writing-assessment/assessment";
import { startAssessmentForSubmission } from "@/lib/writing-assessment/manual-start";
import { setWritingDailyLimit } from "@/lib/writing-assessment/queue";
import { MAX_WRITING_DAILY_LIMIT } from "@/lib/writing-assessment/constants";
import { currentViewer } from "@/lib/speaking-audio/viewer";

/**
 * Phase O - the server actions of the Writing assessment. Every one re-checks who is asking: a student only reaches their own assessments (and only when the result is shown
 * to them), a teacher their own students', a Root Teacher everybody's. The pages that call them set `maxDuration`, because the assessment itself runs AFTER the response.
 */

export type ActionResult = { success: true } | { success: false; error: string };

const idSchema = z.string().trim().min(1).max(64);

const failure = (error: unknown, fallback: string): ActionResult => {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND") || digest === "DYNAMIC_SERVER_USAGE") throw error;
  logServerError("writing-assessment:action", error);
  return { success: false, error: fallback };
};

/** "Try again" on a failed assessment (the student who may see it, or a teacher of that student). The same essays are assessed again. */
export async function retryWritingAssessmentAction(assessmentId: string): Promise<ActionResult> {
  try {
    const viewer = await currentViewer();
    if (!viewer) return { success: false, error: "Sign in again to continue." };
    const result = await retryAssessment(viewer, idSchema.parse(assessmentId));
    if (!result.ok) return { success: false, error: result.error };
    revalidatePath("/student/writing");
    revalidatePath("/teacher/scores");
    return { success: true };
  } catch (error) {
    return failure(error, "Could not start the assessment again. Please try again in a moment.");
  }
}

/** A teacher starts the AI assessment of an essay (or of a Full Mock's Writing paper) that has none. */
export async function startWritingAssessmentAction(submissionId: string): Promise<ActionResult & { assessmentId?: string }> {
  try {
    const { profile } = await requireTeacherProfile();
    const started = await startAssessmentForSubmission(profile.id, idSchema.parse(submissionId));
    if (!started.ok) return { success: false, error: started.error };
    revalidatePath(`/teacher/writing-reviews/${submissionId}`);
    revalidatePath("/teacher/scores");
    return { success: true, assessmentId: started.assessmentId };
  } catch (error) {
    return failure(error, "Could not start the assessment. Please try again.");
  }
}

/** The Root Teacher's number: how many Writing sittings each student may have assessed a day. */
export async function setWritingDailyLimitAction(limit: number): Promise<{ success: true; limit: number } | { success: false; error: string }> {
  try {
    const { profile } = await requireTeacherProfile();
    if (!profile.isRootTeacher) return { success: false, error: "Only the Root Teacher can change this limit." };
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_WRITING_DAILY_LIMIT) return { success: false, error: `The daily limit is a whole number from 1 to ${MAX_WRITING_DAILY_LIMIT}.` };
    const stored = await setWritingDailyLimit(limit, profile.id);
    revalidatePath("/teacher/speaking-recordings/usage");
    return { success: true, limit: stored };
  } catch (error) {
    const result = failure(error, "Could not save the limit. Please try again.");
    return { success: false, error: result.success ? "" : result.error };
  }
}
