"use server";

import { revalidatePath } from "next/cache";

import { requireTeacherProfile } from "@/lib/session";
import * as fullMockTests from "@/lib/full-mock-tests";
import { uploadFullMockCoverImage } from "@/lib/uploads/image-storage";
import { friendlyErrorMessage } from "@/lib/validation-error";
import {
  fullMockBasicsSchema,
  fullMockSpeakingTaskSchema,
  fullMockWritingTaskSchema,
  type FullMockBasicsFormInput,
  type FullMockSpeakingTaskFormInput,
  type FullMockWritingTaskFormInput,
} from "@/lib/validations/full-mock";

export type ActionResult = { success: true } | { success: false; error: string };

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export async function createFullMockTestAction(input: FullMockBasicsFormInput): Promise<ActionResult & { fullMockTestId?: string }> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = fullMockBasicsSchema.parse(input);
    const test = await fullMockTests.createFullMockTest(profile.id, parsed);
    revalidatePath("/teacher/tests");
    return { success: true, fullMockTestId: test.id };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not create the full mock test.") };
  }
}

export async function uploadFullMockCoverImageAction(formData: FormData): Promise<ActionResult & { path?: string }> {
  try {
    const { profile } = await requireTeacherProfile();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("No file provided.");
    const uploaded = await uploadFullMockCoverImage(profile.id, file);
    return { success: true, path: uploaded.path };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not upload the cover image.") };
  }
}

export async function updateFullMockBasicsAction(id: string, input: FullMockBasicsFormInput): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = fullMockBasicsSchema.parse(input);
    await fullMockTests.updateFullMockTestBasics(id, profile.id, parsed);
    revalidatePath(`/teacher/tests/full-mock/${id}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the full mock test.") };
  }
}

export async function setFullMockReadingTestAction(id: string, mockTestId: string | null): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await fullMockTests.setFullMockReadingTest(id, profile.id, mockTestId);
    revalidatePath(`/teacher/tests/full-mock/${id}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not set the reading section.") };
  }
}

export async function setFullMockListeningTestAction(id: string, mockTestId: string | null): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await fullMockTests.setFullMockListeningTest(id, profile.id, mockTestId);
    revalidatePath(`/teacher/tests/full-mock/${id}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not set the listening section.") };
  }
}

export async function saveFullMockWritingTaskAction(id: string, input: FullMockWritingTaskFormInput): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = fullMockWritingTaskSchema.parse(input);
    await fullMockTests.saveFullMockWritingTask(id, profile.id, parsed);
    revalidatePath(`/teacher/tests/full-mock/${id}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not save the writing task.") };
  }
}

export async function deleteFullMockWritingTaskAction(id: string, sectionId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await fullMockTests.deleteFullMockWritingTask(id, profile.id, sectionId);
    revalidatePath(`/teacher/tests/full-mock/${id}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not remove the writing task.") };
  }
}

export async function saveFullMockSpeakingTaskAction(id: string, input: FullMockSpeakingTaskFormInput): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = fullMockSpeakingTaskSchema.parse(input);
    await fullMockTests.saveFullMockSpeakingTask(id, profile.id, parsed);
    revalidatePath(`/teacher/tests/full-mock/${id}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not save the speaking task.") };
  }
}

export async function deleteFullMockSpeakingTaskAction(id: string, sectionId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await fullMockTests.deleteFullMockSpeakingTask(id, profile.id, sectionId);
    revalidatePath(`/teacher/tests/full-mock/${id}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not remove the speaking task.") };
  }
}

export async function publishFullMockTestAction(id: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await fullMockTests.publishFullMockTest(id, profile.id);
    revalidatePath(`/teacher/tests/full-mock/${id}`);
    revalidatePath("/teacher/tests");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not publish the full mock test.") };
  }
}

export async function unpublishFullMockTestAction(id: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await fullMockTests.unpublishFullMockTest(id, profile.id);
    revalidatePath(`/teacher/tests/full-mock/${id}`);
    revalidatePath("/teacher/tests");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not unpublish the full mock test.") };
  }
}

export type DeleteFullMockResult = { success: true; warning?: string } | { success: false; error: string };

export async function deleteFullMockTestAction(id: string, options: { deleteAttempts?: boolean } = {}): Promise<DeleteFullMockResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const outcome = await fullMockTests.deleteFullMockTest(id, profile.id, { deleteAttempts: options.deleteAttempts === true });
    revalidatePath("/teacher/tests");
    revalidatePath("/teacher/mock-results");
    revalidatePath("/teacher/tests/import");
    return {
      success: true,
      warning:
        outcome.failedFiles.length > 0
          ? `The mock was deleted, but ${outcome.failedFiles.length} stored file${outcome.failedFiles.length === 1 ? "" : "s"} could not be removed and may need manual cleanup.`
          : undefined,
    };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the full mock test.") };
  }
}

export async function archiveFullMockTestAction(id: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await fullMockTests.archiveFullMockTest(id, profile.id);
    revalidatePath("/teacher/tests");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not archive the full mock test.") };
  }
}

export async function unarchiveFullMockTestAction(id: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await fullMockTests.unarchiveFullMockTest(id, profile.id);
    revalidatePath("/teacher/tests");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not unarchive the full mock test.") };
  }
}

export async function duplicateFullMockTestAction(id: string): Promise<ActionResult & { fullMockTestId?: string }> {
  try {
    const { profile } = await requireTeacherProfile();
    const clone = await fullMockTests.duplicateFullMockTest(id, profile.id);
    revalidatePath("/teacher/tests");
    return { success: true, fullMockTestId: clone.id };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not duplicate the full mock test.") };
  }
}
