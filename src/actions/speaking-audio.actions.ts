"use server";

import { revalidatePath } from "next/cache";

import { requireUser, requireStudentProfile, requireTeacherProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import { logServerError } from "@/lib/error-logger";
import { prisma } from "@/lib/prisma";
import {
  PracticeError,
  addComment,
  deleteComment,
  finalizePractice,
  getRecordingUrl,
  refreshUpload,
  retryPractice,
  runInBackground,
  setDailyLimit,
  startPractice,
  teacherViewer,
  type StartedPractice,
} from "@/lib/speaking-audio/practice";
import { processPractice } from "@/lib/speaking-audio/processing";
import type { PracticeStatus } from "@/lib/speaking-audio/status";

/**
 * Phase Q-B - the server actions behind the recorded Speaking practice. Every one re-checks who is asking (a student only ever reaches their own practices, a teacher
 * their own students', a Root Teacher everybody's) and returns a plain sentence on failure; nothing here trusts what the browser says about a practice.
 *
 * The pages that call the assessment actions set `maxDuration` so the AI work, which runs AFTER the response has been sent, is not cut short.
 */

export type ActionFailure = { success: false; error: string; code?: "LIMIT" | "NOT_FOUND" | "STATE" | "INVALID" | "AUDIO_MISSING" | "PREMIUM" };
type Failure = ActionFailure;

/**
 * What a failed action says. A PracticeError carries a sentence written for the student. Anything else (a database or storage error) is written to the server log and the
 * student gets the plain fallback, never the technical text. A redirect (the session ended) or a "not found" thrown by the session helpers is not a failure: it goes on to Next.
 */
function failure(error: unknown, fallback: string): Failure {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND") || digest === "DYNAMIC_SERVER_USAGE") throw error;
  if (error instanceof PracticeError) return { success: false, error: error.message, code: error.code };
  logServerError("speaking-audio:action", error);
  return { success: false, error: fallback };
}

const PREMIUM_MESSAGE = "Speaking practice with an AI assessment is a Premium feature. Upgrade to record an answer.";

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------- student

export async function startSpeakingAudioPracticeAction(input: unknown): Promise<({ success: true } & StartedPractice) | Failure> {
  try {
    const { profile } = await requireStudentProfile();
    if (!(await hasActiveAccess(profile.id))) return { success: false, error: PREMIUM_MESSAGE, code: "PREMIUM" };
    const started = await startPractice(profile.id, input);
    return { success: true, ...started };
  } catch (error) {
    return failure(error, "Could not start your practice. Please try again.");
  }
}

export async function refreshSpeakingAudioUploadAction(practiceId: string): Promise<({ success: true } & StartedPractice) | Failure> {
  try {
    const { profile } = await requireStudentProfile();
    const started = await refreshUpload(profile.id, practiceId);
    return { success: true, ...started };
  } catch (error) {
    return failure(error, "Could not prepare the upload again. Please try again.");
  }
}

/** The recording is uploaded: the server checks that it really is there, counts the practice and starts the assessment in the background. */
export async function finalizeSpeakingAudioPracticeAction(practiceId: string): Promise<{ success: true; status: PracticeStatus } | Failure> {
  try {
    const { profile } = await requireStudentProfile();
    const result = await finalizePractice(profile.id, practiceId);
    if (result.started) runInBackground(() => processPractice(practiceId));
    revalidatePath("/student/speaking-practice/recordings");
    return { success: true, status: result.status };
  } catch (error) {
    return failure(error, "Could not confirm your recording. Please try again.");
  }
}

/** "Try again" on a failed assessment: the same recording and the same practice, so it does not count toward the daily limit a second time. */
export async function retrySpeakingAudioPracticeAction(practiceId: string): Promise<{ success: true } | Failure> {
  try {
    const { profile } = await requireStudentProfile();
    if (!(await hasActiveAccess(profile.id))) return { success: false, error: PREMIUM_MESSAGE, code: "PREMIUM" };
    const restarted = await retryPractice(profile.id, practiceId);
    if (!restarted) return { success: false, error: "This practice cannot be assessed again. Record your answer again.", code: "STATE" };
    runInBackground(() => processPractice(practiceId));
    revalidatePath(`/student/speaking-practice/record/${practiceId}`);
    return { success: true };
  } catch (error) {
    return failure(error, "Could not start the assessment again. Please try again.");
  }
}

/** A fresh short-lived link to the recording (the player asks for one when the one it has has expired). Student: their own; teacher: their students'; Root: any. */
export async function getSpeakingAudioUrlAction(practiceId: string): Promise<{ success: true; url: string; expiresInSeconds: number } | Failure> {
  try {
    const user = await requireUser();
    let link;
    if (user.role === "STUDENT") {
      const { profile } = await requireStudentProfile();
      link = await getRecordingUrl({ kind: "student", studentId: profile.id }, practiceId);
    } else {
      const { profile } = await requireTeacherProfile();
      link = await getRecordingUrl(await teacherViewer(profile.id), practiceId);
    }
    if (!link) return { success: false, error: "This recording is not available.", code: "NOT_FOUND" };
    return { success: true, url: link.url, expiresInSeconds: link.expiresInSeconds };
  } catch (error) {
    return failure(error, "Could not open the recording.");
  }
}

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------- teacher

export async function addSpeakingAudioCommentAction(practiceId: string, body: string): Promise<{ success: true } | Failure> {
  try {
    const { profile } = await requireTeacherProfile();
    await addComment(profile.id, practiceId, body);
    revalidatePath(`/teacher/speaking-recordings/${practiceId}`);
    revalidatePath(`/student/speaking-practice/record/${practiceId}`);
    return { success: true };
  } catch (error) {
    return failure(error, "Could not save your comment.");
  }
}

export async function deleteSpeakingAudioCommentAction(commentId: string): Promise<{ success: true } | Failure> {
  try {
    const { profile } = await requireTeacherProfile();
    const comment = await prisma.speakingAudioComment.findUnique({ where: { id: commentId }, select: { practiceId: true } });
    await deleteComment(profile.id, commentId);
    if (comment) {
      revalidatePath(`/teacher/speaking-recordings/${comment.practiceId}`);
      revalidatePath(`/student/speaking-practice/record/${comment.practiceId}`);
    }
    return { success: true };
  } catch (error) {
    return failure(error, "Could not remove the comment.");
  }
}

// ----------------------------------------------------------------------------------------------------------------------------------------------------------------- Root Teacher

/** The daily number of recorded practices a student may make. Only a Root Teacher changes it (checked here, never taken from the page). */
export async function setSpeakingDailyLimitAction(limit: number): Promise<{ success: true; limit: number } | Failure> {
  try {
    const { profile } = await requireTeacherProfile();
    if (!profile.isRootTeacher) return { success: false, error: "Only the Root Teacher can change the daily limit.", code: "NOT_FOUND" };
    const stored = await setDailyLimit(Math.floor(Number(limit)), profile.id);
    revalidatePath("/teacher/speaking-recordings/usage");
    return { success: true, limit: stored };
  } catch (error) {
    return failure(error, "Could not save the daily limit.");
  }
}
