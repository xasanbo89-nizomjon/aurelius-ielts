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
  submitSpeakingResponse,
  reviewSpeakingSubmission,
  type SpeakingTaskForStudent,
} from "@/lib/speaking";
import { prepareSpeakingAudioUpload } from "@/lib/uploads/audio-storage";
import { friendlyErrorMessage } from "@/lib/validation-error";
import {
  createSpeakingTaskSchema,
  updateSpeakingTaskSchema,
  speakingCodeSchema,
  reviewSpeakingSubmissionSchema,
  type CreateSpeakingTaskInput,
  type UpdateSpeakingTaskInput,
  type ReviewSpeakingSubmissionInput,
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

export async function reviewSpeakingSubmissionAction(
  submissionId: string,
  taskId: string,
  input: ReviewSpeakingSubmissionInput
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = reviewSpeakingSubmissionSchema.parse(input);
    await reviewSpeakingSubmission(submissionId, profile.id, parsed);
    revalidatePath(`/teacher/speaking/${taskId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not save the review.") };
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

export type PrepareSpeakingAudioUploadResult =
  | { success: true; signedUrl: string; token: string; path: string; publicUrl: string }
  | { success: false; error: string };

/** Same direct-to-Supabase pattern as article audio — see prepareSpeakingAudioUpload. */
export async function prepareSpeakingAudioUploadAction(input: {
  fileSize: number;
  contentType: string;
}): Promise<PrepareSpeakingAudioUploadResult> {
  try {
    const { profile } = await requireStudentProfile();
    if (!(await hasActiveAccess(profile.id))) {
      return { success: false, error: "Speaking is a Premium feature. Upgrade to submit a recording." };
    }
    const upload = await prepareSpeakingAudioUpload(profile.id, { size: input.fileSize, type: input.contentType });
    return { success: true, ...upload };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not prepare the recording upload.") };
  }
}

export async function submitSpeakingResponseAction(taskId: string, audioUrl: string): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    if (!(await hasActiveAccess(profile.id))) {
      return { success: false, error: "Speaking is a Premium feature. Upgrade to submit a recording." };
    }
    await submitSpeakingResponse(profile.id, taskId, audioUrl);
    revalidatePath("/student/speaking");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not submit your recording.") };
  }
}
