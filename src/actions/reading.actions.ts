"use server";

import { requireStudentProfile } from "@/lib/session";
import { saveReadingProgress, saveAudioProgress } from "@/lib/reading-progress";
import {
  readingProgressSchema,
  audioProgressSchema,
  type ReadingProgressInput,
  type AudioProgressInput,
} from "@/lib/validations/articles";

export type SaveReadingProgressResult = { success: true } | { success: false; error: string };

/**
 * No revalidatePath here — this fires repeatedly while a student scrolls
 * (debounced client-side) and a full route revalidation on every save would
 * be wasteful. The student's own article list re-fetches progress fresh the
 * next time they actually navigate there.
 */
export async function saveReadingProgressAction(input: ReadingProgressInput): Promise<SaveReadingProgressResult> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = readingProgressSchema.parse(input);
    await saveReadingProgress(profile.id, parsed.articleId, {
      lastPosition: parsed.lastPosition,
      percentComplete: parsed.percentComplete,
      timeSpentSeconds: parsed.timeSpentSeconds,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save reading progress." };
  }
}

/** Same debounced, no-revalidate shape as saveReadingProgressAction — fires repeatedly while audio plays. */
export async function saveArticleAudioProgressAction(input: AudioProgressInput): Promise<SaveReadingProgressResult> {
  try {
    const { profile } = await requireStudentProfile();
    const parsed = audioProgressSchema.parse(input);
    await saveAudioProgress(profile.id, parsed.articleId, {
      audioProgress: parsed.audioProgress,
      timeSpentSeconds: parsed.timeSpentSeconds,
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save audio progress." };
  }
}
