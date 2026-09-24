"use server";

import { revalidatePath } from "next/cache";

import { requireStudentProfile, requireTeacherProfile } from "@/lib/session";
import { hasActiveAccess } from "@/lib/subscription";
import {
  createSpeakingTask,
  updateSpeakingTask,
  setSpeakingTaskStatus,
  deleteSpeakingTask,
  findSpeakingTaskByCode,
  submitAndEvaluateSpeakingResponse,
  addSpeakingTeacherNotes,
  assertWithinSpeakingRateLimit,
  setDailySpeakingEvaluationLimit,
  SpeakingTranscriptTooShortError,
  type SpeakingTaskForStudent,
} from "@/lib/speaking";
import { friendlyErrorMessage } from "@/lib/validation-error";
import {
  createSpeakingTaskSchema,
  updateSpeakingTaskSchema,
  speakingCodeSchema,
  speakingTeacherNotesSchema,
  type CreateSpeakingTaskInput,
  type UpdateSpeakingTaskInput,
  type SpeakingTeacherNotesInput,
} from "@/lib/validations/speaking";

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export type ActionResult = { success: true } | { success: false; error: string };

// ---------------------------------------------------------------------------
// Teacher
// ---------------------------------------------------------------------------

export async function createSpeakingTaskAction(
  input: CreateSpeakingTaskInput
): Promise<ActionResult & { taskId?: string }> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = createSpeakingTaskSchema.parse(input);
    const task = await createSpeakingTask(profile.id, parsed);
    revalidatePath("/teacher/speaking");
    return { success: true, taskId: task.id };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not create the speaking task.") };
  }
}

export async function updateSpeakingTaskAction(taskId: string, input: UpdateSpeakingTaskInput): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = updateSpeakingTaskSchema.parse(input);
    await updateSpeakingTask(taskId, profile.id, parsed);
    revalidatePath(`/teacher/speaking/${taskId}`);
    revalidatePath("/teacher/speaking");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the speaking task.") };
  }
}

export async function setSpeakingTaskStatusAction(
  taskId: string,
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await setSpeakingTaskStatus(taskId, profile.id, status);
    revalidatePath(`/teacher/speaking/${taskId}`);
    revalidatePath("/teacher/speaking");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the task status.") };
  }
}

export async function deleteSpeakingTaskAction(taskId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await deleteSpeakingTask(taskId, profile.id);
    revalidatePath("/teacher/speaking");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the speaking task.") };
  }
}

export async function updateDailySpeakingEvaluationLimitAction(limit: number): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await setDailySpeakingEvaluationLimit(profile.id, limit);
    revalidatePath("/teacher/speaking/analytics");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the limit.") };
  }
}

export async function addSpeakingTeacherNotesAction(
  submissionId: string,
  taskId: string,
  input: SpeakingTeacherNotesInput
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = speakingTeacherNotesSchema.parse(input);
    await addSpeakingTeacherNotes(submissionId, profile.id, parsed.notes);
    revalidatePath(`/teacher/speaking/${taskId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not save your note.") };
  }
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

export type FindSpeakingTaskResult =
  | { success: true; task: SpeakingTaskForStudent }
  | { success: false; error: string };

export async function findSpeakingTaskByCodeAction(code: string): Promise<FindSpeakingTaskResult> {
  try {
    await requireStudentProfile();
    const parsed = speakingCodeSchema.parse({ code });
    const task = await findSpeakingTaskByCode(parsed.code);
    if (!task) return { success: false, error: "No speaking task found for that code." };
    return { success: true, task };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not find that speaking task.") };
  }
}

export type SubmitSpeakingRecordingResult =
  | { success: true; submissionId: string }
  | { success: false; error: string };

/**
 * Phase 27 — the recording goes straight from the browser to this action
 * (no Supabase step) and is discarded the moment evaluation finishes;
 * nothing in this call path ever writes the audio anywhere durable.
 */
export async function submitSpeakingRecordingAction(taskId: string, audio: File): Promise<SubmitSpeakingRecordingResult> {
  try {
    const { profile } = await requireStudentProfile();
    if (!(await hasActiveAccess(profile.id))) {
      return { success: false, error: "Speaking is a Premium feature. Upgrade to submit a recording." };
    }

    const rateLimit = await assertWithinSpeakingRateLimit(profile.id, profile.teacherId);
    if (!rateLimit.ok) {
      return { success: false, error: rateLimit.error };
    }

    const buffer = Buffer.from(await audio.arrayBuffer());
    const submission = await submitAndEvaluateSpeakingResponse(profile.id, taskId, {
      buffer,
      size: audio.size,
      mimeType: audio.type || "audio/webm",
    });

    revalidatePath("/student/speaking");
    return { success: true, submissionId: submission.id };
  } catch (error) {
    if (error instanceof SpeakingTranscriptTooShortError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: errorMessage(error, "Could not evaluate your recording. Please try again.") };
  }
}
