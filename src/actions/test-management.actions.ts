"use server";

import { revalidatePath } from "next/cache";
import type { Prisma, PassageAttachmentType, QuestionType } from "@prisma/client";

import { requireTeacherProfile } from "@/lib/session";
import * as tm from "@/lib/exam/test-management";
import { PublishValidationError } from "@/lib/exam/test-publish";
import { copyTest, type CopyMode } from "@/lib/exam/test-versions";
import type { TestIssue } from "@/lib/exam/test-validation";
import { uploadListeningAudio } from "@/lib/uploads/audio-storage";
import { uploadContentCoverImage } from "@/lib/uploads/image-storage";
import { friendlyErrorMessage } from "@/lib/validation-error";
import {
  createTestSchema,
  updateTestSchema,
  passageSchema,
  questionBaseSchema,
  questionGroupSchema,
  type CreateTestInput,
  type UpdateTestInput,
  type PassageInput,
  type QuestionBaseInput,
  type QuestionGroupInput,
} from "@/lib/validations/test-management";

export type ActionResult = { success: true } | { success: false; error: string };

// A thin alias so every catch block below keeps its existing call shape —
// see src/lib/validation-error.ts for why this never leaks a raw ZodError.
function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

/** Phase 47 — Skill Media Library's "Content thumbnail" for a Reading/Listening test, set separately from the test's other fields. `formData: null` removes the cover. */
export async function setTestCoverImageAction(testId: string, formData: FormData | null): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    let coverImagePath: string | null = null;
    if (formData) {
      const file = formData.get("file");
      if (!(file instanceof File)) throw new Error("No file provided.");
      coverImagePath = (await uploadContentCoverImage(profile.id, file)).path;
    }
    await tm.updateTest(testId, profile.id, { coverImagePath });
    revalidatePath(`/teacher/tests/${testId}`);
    revalidatePath("/teacher/tests");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the cover image.") };
  }
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

export type PublishActionResult = { success: true } | { success: false; error: string; issues?: TestIssue[] };

/** Publishing re-validates the stored test; a test that is not ready answers with the full list of problems (each names the field to fix). */
export async function setPublishedAction(testId: string, isPublished: boolean): Promise<PublishActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await tm.setPublished(testId, profile.id, isPublished);
    revalidatePath(`/teacher/tests/${testId}`);
    revalidatePath("/teacher/tests");
    return { success: true };
  } catch (error) {
    if (error instanceof PublishValidationError) return { success: false, error: error.message, issues: error.issues };
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

/**
 * Phase L1 - "Create new version" / "Duplicate": a complete draft copy with new ids (see test-versions). Full Mocks, assignments and access codes keep
 * using the test it was copied from; every attempt stays on that one.
 */
export async function copyTestAction(testId: string, mode: CopyMode): Promise<ActionResult & { testId?: string }> {
  try {
    const { profile } = await requireTeacherProfile();
    const copy = await copyTest(testId, profile.id, mode);
    revalidatePath("/teacher/tests");
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true, testId: copy.id };
  } catch (error) {
    return { success: false, error: errorMessage(error, mode === "version" ? "Could not create a new version." : "Could not duplicate the test.") };
  }
}

export type DeleteTestActionResult ={ success: true; warning?: string } | { success: false; error: string };

/**
 * Phase A — deletes a test with everything attached to it (questions, answer
 * key, attempts, audio and other uploaded files). `deleteResults` must be
 * passed explicitly when students have attempted the test — the UI only sends
 * it after a separate, clearly-worded confirmation.
 */
export async function deleteTestAction(testId: string, options: { deleteResults?: boolean } = {}): Promise<DeleteTestActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const outcome = await tm.deleteTest(testId, profile.id, { deleteResults: options.deleteResults === true });
    revalidatePath("/teacher/tests");
    revalidatePath("/teacher/mock-results");
    return {
      success: true,
      warning:
        outcome.failedFiles.length > 0
          ? `The test was deleted, but ${outcome.failedFiles.length} uploaded file${outcome.failedFiles.length === 1 ? "" : "s"} could not be removed from storage and may need manual cleanup.`
          : undefined,
    };
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
    // Phase L1 - the group numbers follow the rows (the student's own numbering), never what was typed.
    await tm.syncGroupRanges(testId);
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the passage.") };
  }
}

/** Phase B — remove one section's audio (and its stored file, unless another section of the test shares the same recording). */
export async function removePassageAudioAction(passageId: string, testId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await tm.removePassageAudio(passageId, profile.id);
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not remove the audio.") };
  }
}

/** Phase B — remove the audio from every section of a Listening test. */
export async function removeTestAudioAction(testId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await tm.removeTestAudio(testId, profile.id);
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not remove the audio.") };
  }
}

export async function addPassageAttachmentAction(
  passageId: string,
  testId: string,
  input: { type: PassageAttachmentType; imagePath: string; caption?: string; mediaFileId?: string }
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await tm.addPassageAttachment(passageId, profile.id, input);
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not add the attachment.") };
  }
}

export async function deletePassageAttachmentAction(attachmentId: string, testId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await tm.deletePassageAttachment(attachmentId, profile.id);
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the attachment.") };
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
    // Phase L1 - the group numbers follow the rows (the student's own numbering), never what was typed.
    await tm.syncGroupRanges(testId);
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
    // Phase L1 - the group numbers follow the rows (the student's own numbering), never what was typed.
    await tm.syncGroupRanges(testId);
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
    // Phase L1 - the group numbers follow the rows (the student's own numbering), never what was typed.
    await tm.syncGroupRanges(testId);
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
    // Phase L1 - the group numbers follow the rows (the student's own numbering), never what was typed.
    await tm.syncGroupRanges(testId);
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not reorder the question.") };
  }
}

/** Phase 50.1 — "Questions 1-5"-style teacher-side grouping within a passage. */
export async function addQuestionGroupAction(
  testId: string,
  passageId: string,
  input: QuestionGroupInput
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = questionGroupSchema.parse(input);
    await tm.addQuestionGroup(passageId, profile.id, parsed);
    // Phase L1 - the group numbers follow the rows (the student's own numbering), never what was typed.
    await tm.syncGroupRanges(testId);
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not add the question group.") };
  }
}

export async function updateQuestionGroupAction(
  groupId: string,
  testId: string,
  input: QuestionGroupInput
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = questionGroupSchema.parse(input);
    await tm.updateQuestionGroup(groupId, profile.id, parsed);
    // Phase L1 - the group numbers follow the rows (the student's own numbering), never what was typed.
    await tm.syncGroupRanges(testId);
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the question group.") };
  }
}

export async function deleteQuestionGroupAction(groupId: string, testId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await tm.deleteQuestionGroup(groupId, profile.id);
    // Phase L1 - the group numbers follow the rows (the student's own numbering), never what was typed.
    await tm.syncGroupRanges(testId);
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the question group.") };
  }
}

export async function moveQuestionGroupAction(
  groupId: string,
  testId: string,
  direction: "up" | "down"
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await tm.moveQuestionGroup(groupId, profile.id, direction);
    // Phase L1 - the group numbers follow the rows (the student's own numbering), never what was typed.
    await tm.syncGroupRanges(testId);
    revalidatePath(`/teacher/tests/${testId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not reorder the question group.") };
  }
}

export type { QuestionType };
