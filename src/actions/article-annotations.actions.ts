"use server";

import type { HighlightColor } from "@prisma/client";

import { requireStudentProfile } from "@/lib/session";
import * as annotations from "@/lib/article-annotations";
import { friendlyErrorMessage } from "@/lib/validation-error";

function errorMessage(error: unknown, fallback: string): string {
  return friendlyErrorMessage(error, fallback);
}

export type ActionResult = { success: true } | { success: false; error: string };

export async function addArticleHighlightAction(input: {
  articleId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  color: HighlightColor;
}): Promise<ActionResult & { highlightId?: string }> {
  try {
    const { profile } = await requireStudentProfile();
    const highlight = await annotations.addArticleHighlight(profile.id, input);
    return { success: true, highlightId: highlight.id };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not save the highlight.") };
  }
}

export async function removeArticleHighlightAction(highlightId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    await annotations.removeArticleHighlight(profile.id, highlightId);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not remove the highlight.") };
  }
}

export async function addArticleNoteAction(input: { articleId: string; content: string }): Promise<ActionResult & { noteId?: string }> {
  try {
    const { profile } = await requireStudentProfile();
    const note = await annotations.addArticleNote(profile.id, input);
    return { success: true, noteId: note.id };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not save the note.") };
  }
}

export async function updateArticleNoteAction(noteId: string, content: string): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    await annotations.updateArticleNote(profile.id, noteId, content);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not update the note.") };
  }
}

export async function deleteArticleNoteAction(noteId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    await annotations.deleteArticleNote(profile.id, noteId);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error, "Could not delete the note.") };
  }
}
