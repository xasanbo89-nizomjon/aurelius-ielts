"use server";

import { revalidatePath } from "next/cache";
import type { Prisma, QuestionType } from "@prisma/client";

import { requireTeacherProfile } from "@/lib/session";
import * as tm from "@/lib/exam/test-management";
import { uploadListeningAudio } from "@/lib/uploads/audio-storage";
import { friendlyErrorMessage } from "@/lib/validation-error";
import {
  createTestSchema,
  updateTestSchema,
  passageSchema,
  questionBaseSchema,
  type CreateTestInput,
  type UpdateTestInput,
  type PassageInput,
  type QuestionBaseInput,
} from "@/lib/validations/test-management";

export type ActionResult = { success: true } | { success: false; error: string };

// A thin alias so every catch block below keeps its existing call shape —
// see src/lib/validation-error.ts for why this never leaks a raw ZodError.
function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export async function createTestAction(
  input: CreateTestInput
): Promise<ActionResult & { testId?: string }> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = createTestSchema.parse(input);
    const test = await tm.createTest(profile.id, parsed);
    revalidatePath("/teacher/tests");
    return { success: true, testId: test.id };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not create the test.") };
  }
}

export async function updateTestAction(testId: string, input: UpdateTestInput): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = updateTestSchema.parse(input);
    await tm.updateTest(testId, profile.id, parsed);
    revalidatePath(`/teacher/tests/${testId}`);
    revalidatePath("/teacher/tests");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the test.") };
  }
}

export async function setPublishedAction(testId: string, isPublished: boolean): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await tm.setPublished(testId, profile.id, isPublished);
    revalidatePath(`/teacher/tests/${testId}`);
    revalidatePath("/teacher/tests");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update publish status.") };
  }
}

export async function setArchivedAction(testId: string, isArchived: boolean): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await tm.setArchived(testId, profile.id, isArchived);
    revalidatePath(`/teacher/tests/${testId}`);
    revalidatePath("/teacher/tests");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update archive status.") };
  }
}

export async function deleteTestAction(testId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await tm.deleteTest(testId, profile.id);
    revalidatePath("/teacher/tests");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the test.") };
  }
}

export async function addPassageAction(testId: string, input: PassageInput): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = passageSchema.parse(input);
    await tm.addPassage(testId, profile.id, parsed);
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not add the passage.") };
  }
}

export async function updatePassageAction(
  passageId: string,
  testId: string,
  input: PassageInput
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    // Audio fields are only present in `input` when the dialog just
    // uploaded a new file — omitted otherwise, so Prisma leaves an existing
    // passage's audio (legacy audioUrl or a previous upload) untouched.
    const parsed = passageSchema.parse(input);
    await tm.updatePassage(passageId, profile.id, parsed);
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the passage.") };
  }
}

export type UploadPassageAudioResult =
  | { success: true; path: string; fileName: string; mimeType: string; size: number }
  | { success: false; error: string };

export async function uploadPassageAudioAction(formData: FormData): Promise<UploadPassageAudioResult> {
  try {
    const { profile } = await requireTeacherProfile();

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false, error: "No file was provided." };
    }

    const uploaded = await uploadListeningAudio(profile.id, file);
    return { success: true, ...uploaded };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not upload the audio file.") };
  }
}

export async function deletePassageAction(passageId: string, testId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await tm.deletePassage(passageId, profile.id);
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the passage.") };
  }
}

export async function addQuestionAction(
  testId: string,
  base: QuestionBaseInput,
  options: Prisma.InputJsonValue,
  correctAnswer: Prisma.InputJsonValue
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsedBase = questionBaseSchema.parse(base);
    await tm.addQuestion(testId, profile.id, { ...parsedBase, options, correctAnswer });
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not add the question.") };
  }
}

export async function updateQuestionAction(
  questionId: string,
  testId: string,
  base: QuestionBaseInput,
  options: Prisma.InputJsonValue,
  correctAnswer: Prisma.InputJsonValue
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsedBase = questionBaseSchema.parse(base);
    await tm.updateQuestion(questionId, profile.id, { ...parsedBase, options, correctAnswer });
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the question.") };
  }
}

export async function deleteQuestionAction(questionId: string, testId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await tm.deleteQuestion(questionId, profile.id);
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the question.") };
  }
}

export async function moveQuestionAction(
  questionId: string,
  testId: string,
  direction: "up" | "down"
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await tm.moveQuestion(questionId, profile.id, direction);
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not reorder the question.") };
  }
}

export type { QuestionType };
