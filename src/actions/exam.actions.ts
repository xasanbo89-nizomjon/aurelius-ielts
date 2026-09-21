"use server";

import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { requireStudentProfile } from "@/lib/session";
import * as attempts from "@/lib/exam/attempts";
import * as annotations from "@/lib/exam/annotations";
import { hasActiveAccess } from "@/lib/subscription";

export type ActionResult = { success: true } | { success: false; error: string };

export async function startAttemptAction(mockTestId: string) {
  const { profile } = await requireStudentProfile();

  // Real, server-side gate — never trust that the "Start test" button was
  // only shown to students with active access.
  if (!(await hasActiveAccess(profile.id))) {
    redirect("/student/subscription?upgrade=1");
  }

  const attempt = await attempts.getOrCreateAttempt(profile.id, mockTestId);

  if (!attempt) {
    redirect("/student/dashboard?error=test-unavailable");
  }

  redirect(`/student/exam/attempt/${attempt.id}`);
}

export async function saveAnswerAction(
  resultId: string,
  questionId: string,
  response: Prisma.InputJsonValue
): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    await attempts.saveAnswer(resultId, profile.id, questionId, response);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save your answer." };
  }
}

export async function toggleFlagAction(
  resultId: string,
  questionId: string
): Promise<ActionResult & { flags?: string[] }> {
  try {
    const { profile } = await requireStudentProfile();
    const flags = await attempts.toggleFlag(resultId, profile.id, questionId);
    return { success: true, flags };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not update flag." };
  }
}

export async function addHighlightAction(
  resultId: string,
  input: { passageId: string; text: string; startOffset: number; endOffset: number }
): Promise<ActionResult & { highlightId?: string }> {
  try {
    const { profile } = await requireStudentProfile();
    const highlight = await annotations.addHighlight(resultId, profile.id, input);
    return { success: true, highlightId: highlight.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save highlight." };
  }
}

export async function removeHighlightAction(resultId: string, highlightId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    await annotations.removeHighlight(resultId, profile.id, highlightId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not remove highlight." };
  }
}

export async function saveNoteAction(
  resultId: string,
  input: { noteId?: string; passageId?: string; content: string }
): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    await annotations.saveNote(resultId, profile.id, input);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save note." };
  }
}

export async function deleteNoteAction(resultId: string, noteId: string): Promise<ActionResult> {
  try {
    const { profile } = await requireStudentProfile();
    await annotations.deleteNote(resultId, profile.id, noteId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not delete note." };
  }
}

export async function submitAttemptAction(resultId: string) {
  const { profile } = await requireStudentProfile();

  if (!(await hasActiveAccess(profile.id))) {
    redirect("/student/subscription?upgrade=1");
  }

  await attempts.submitAttempt(resultId, profile.id);
  redirect(`/student/exam/attempt/${resultId}/results`);
}
