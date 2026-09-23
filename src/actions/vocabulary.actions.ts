"use server";

import { revalidatePath } from "next/cache";

import { requireStudentProfile } from "@/lib/session";
import {
  saveWord,
  updateWordStatus,
  deleteWord,
  getStudentVocabulary,
  type WordDetails,
  type SaveWordResult,
} from "@/lib/vocabulary";
import { getOrGenerateWordDetails } from "@/lib/ai/vocabulary-assistant";
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

/**
 * Never saves anything to the student's notebook by itself — but unlike a
 * plain read, a never-before-looked-up word does trigger real AI generation
 * (translation/definition/example), cached into the shared dictionary for
 * every future lookup. See getOrGenerateWordDetails for the quota/fallback
 * behavior.
 */
export async function getWordDetailsAction(word: string): Promise<GetWordDetailsResult> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = getWordDetailsSchema.parse({ word });
    const details = await getOrGenerateWordDetails(profile.id, profile.teacherId, parsed.word);
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
