"use server";

import { revalidatePath } from "next/cache";

import { requireTeacherProfile } from "@/lib/session";
import * as pdfImport from "@/lib/pdf-test-import";
import { prepareTestImportPdfUpload } from "@/lib/uploads/library-storage";
import {
  createImportedTestSchema,
  updateImportedTestSchema,
  updateImportedPassageSchema,
  updateImportedQuestionGroupSchema,
  upsertImportedAnswerSchema,
  confirmImportSchema,
} from "@/lib/validations/pdf-test-import";
import { friendlyErrorMessage } from "@/lib/validation-error";
import type { SignedUpload } from "@/lib/uploads/supabase";

export type ActionResult = { success: true } | { success: false; error: string };

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export type PrepareUploadResult = (SignedUpload & { success: true }) | { success: false; error: string };

export async function prepareTestImportPdfUploadAction(input: {
  fileName: string;
  fileSize: number;
  contentType: string;
}): Promise<PrepareUploadResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const upload = await prepareTestImportPdfUpload(profile.id, { name: input.fileName, size: input.fileSize, type: input.contentType });
    return { success: true, ...upload };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not prepare the PDF upload.") };
  }
}

export async function createImportedTestAction(input: unknown): Promise<ActionResult & { importedTestId?: string }> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = createImportedTestSchema.parse(input);
    const row = await pdfImport.createImportedTest(profile.id, parsed);
    revalidatePath("/teacher/tests/import");
    return { success: true, importedTestId: row.id };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not start the import.") };
  }
}

export async function analyzeImportedTestAction(importedTestId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await pdfImport.analyzeImportedTest(importedTestId, profile.id);
    revalidatePath(`/teacher/tests/import/${importedTestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not analyze this PDF.") };
  }
}

export async function updateImportedTestMetaAction(importedTestId: string, input: unknown): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = updateImportedTestSchema.parse(input);
    await pdfImport.updateImportedTestMeta(importedTestId, profile.id, parsed);
    revalidatePath(`/teacher/tests/import/${importedTestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the title.") };
  }
}

export async function updateImportedPassageAction(
  importedTestId: string,
  importedPassageId: string,
  input: unknown
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = updateImportedPassageSchema.parse(input);
    await pdfImport.updateImportedPassage(importedPassageId, profile.id, parsed);
    revalidatePath(`/teacher/tests/import/${importedTestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the passage.") };
  }
}

export async function deleteImportedPassageAction(importedTestId: string, importedPassageId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await pdfImport.deleteImportedPassage(importedPassageId, profile.id);
    revalidatePath(`/teacher/tests/import/${importedTestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the passage.") };
  }
}

export async function updateImportedQuestionGroupAction(
  importedTestId: string,
  groupId: string,
  input: unknown
): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = updateImportedQuestionGroupSchema.parse(input);
    await pdfImport.updateImportedQuestionGroup(groupId, profile.id, parsed);
    revalidatePath(`/teacher/tests/import/${importedTestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the question group.") };
  }
}

export async function deleteImportedQuestionGroupAction(importedTestId: string, groupId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await pdfImport.deleteImportedQuestionGroup(groupId, profile.id);
    revalidatePath(`/teacher/tests/import/${importedTestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the question group.") };
  }
}

export async function upsertImportedAnswerAction(importedTestId: string, input: unknown): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = upsertImportedAnswerSchema.parse(input);
    await pdfImport.upsertImportedAnswer(importedTestId, profile.id, parsed);
    revalidatePath(`/teacher/tests/import/${importedTestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not save the answer.") };
  }
}

export async function deleteImportedAnswerAction(importedTestId: string, questionNumber: number): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await pdfImport.deleteImportedAnswer(importedTestId, profile.id, questionNumber);
    revalidatePath(`/teacher/tests/import/${importedTestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the answer.") };
  }
}

export async function deleteImportedTestAction(importedTestId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    await pdfImport.deleteImportedTest(importedTestId, profile.id);
    revalidatePath("/teacher/tests/import");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete this import.") };
  }
}

export type ConfirmImportResult =
  | { success: true; mockTestId: string; unmatchedAnswerCount: number }
  | { success: false; error: string };

export async function confirmImportAction(importedTestId: string, input: unknown): Promise<ConfirmImportResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = confirmImportSchema.parse(input);
    const result = await pdfImport.confirmImport(importedTestId, profile.id, parsed);
    revalidatePath("/teacher/tests");
    revalidatePath(`/teacher/tests/import/${importedTestId}`);
    return { success: true, mockTestId: result.mockTestId, unmatchedAnswerCount: result.warnings.reduce((n, w) => n + w.questionNumbers.length, 0) };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not import the test.") };
  }
}
