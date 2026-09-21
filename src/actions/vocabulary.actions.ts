"use server";

import { revalidatePath } from "next/cache";

import { requireStudentProfile } from "@/lib/session";
import {
  getWordDetails,
  saveWord,
  updateWordStatus,
  deleteWord,
  getStudentVocabulary,
  type WordDetails,
  type SaveWordResult,
} from "@/lib/vocabulary";
import { friendlyErrorMessage } from "@/lib/validation-error";
import {
  getWordDetailsSchema,
  saveWordSchema,
  updateWordStatusSchema,
  deleteWordSchema,
  getStudentVocabularySchema,
  type GetStudentVocabularyInput,
} from "@/lib/validations/vocabulary";

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export type GetWordDetailsResult = { success: true; details: WordDetails } | { success: false; error: string };

/** Read-only — opening the popup never saves anything by itself. */
export async function getWordDetailsAction(word: string): Promise<GetWordDetailsResult> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = getWordDetailsSchema.parse({ word });
    const details = await getWordDetails(profile.id, parsed.word);
    return { success: true, details };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not look up that word.") };
  }
}

export type SaveWordResultAction = { success: true; result: SaveWordResult } | { success: false; error: string };

/** Save a word from an Article — every operation is scoped to the signed-in student via requireStudentProfile(). */
export async function saveWordAction(
  word: string,
  status: "UNKNOWN" | "LEARNING" | "KNOWN",
  articleId?: string
): Promise<SaveWordResultAction> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = saveWordSchema.parse({ word, status, articleId });
    const result = await saveWord(profile.id, parsed.word, parsed.status, parsed.articleId);
    revalidatePath("/student/vocabulary");
    return { success: true, result };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not save that word.") };
  }
}

export type UpdateWordStatusResult = { success: true; details: WordDetails } | { success: false; error: string };

export async function updateWordStatusAction(
  word: string,
  status: "UNKNOWN" | "LEARNING" | "KNOWN"
): Promise<UpdateWordStatusResult> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = updateWordStatusSchema.parse({ word, status });
    const details = await updateWordStatus(profile.id, parsed.word, parsed.status);
    revalidatePath("/student/vocabulary");
    return { success: true, details };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update that word.") };
  }
}

export type DeleteWordResult = { success: true } | { success: false; error: string };

export async function deleteWordAction(word: string): Promise<DeleteWordResult> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = deleteWordSchema.parse({ word });
    await deleteWord(profile.id, parsed.word);
    revalidatePath("/student/vocabulary");
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not remove that word.") };
  }
}

export type GetStudentVocabularyResult =
  | { success: true; result: Awaited<ReturnType<typeof getStudentVocabulary>> }
  | { success: false; error: string };

/** Client-callable variant of getStudentVocabulary() — the vocabulary page itself calls the lib function directly for its initial render. */
export async function getStudentVocabularyAction(
  input: GetStudentVocabularyInput = {}
): Promise<GetStudentVocabularyResult> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = getStudentVocabularySchema.parse(input);
    const result = await getStudentVocabulary(profile.id, parsed);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not load your vocabulary.") };
  }
}
