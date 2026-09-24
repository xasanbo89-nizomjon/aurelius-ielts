"use server";

import { revalidatePath } from "next/cache";

import { requireStudentProfile } from "@/lib/session";
import { toggleQuestionBookmark, toggleWritingTaskBookmark } from "@/lib/bookmarks";
import { friendlyErrorMessage } from "@/lib/validation-error";

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export type ToggleBookmarkResult = { success: true; bookmarked: boolean } | { success: false; error: string };

export async function toggleQuestionBookmarkAction(questionId: string): Promise<ToggleBookmarkResult> {
  try {
    const { profile } = await requireStudentProfile();
    const result = await toggleQuestionBookmark(profile.id, questionId);
    revalidatePath("/student/bookmarks");
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the bookmark.") };
  }
}

export async function toggleWritingTaskBookmarkAction(taskId: string): Promise<ToggleBookmarkResult> {
  try {
    const { profile } = await requireStudentProfile();
    const result = await toggleWritingTaskBookmark(profile.id, taskId);
    revalidatePath("/student/bookmarks");
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the bookmark.") };
  }
}
