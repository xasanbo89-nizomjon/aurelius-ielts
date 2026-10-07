"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireTeacherProfile } from "@/lib/session";
import { approveAllExplanations, approveExplanation, ExplanationInputError, removeExplanation, saveExplanation, unapproveExplanation } from "@/lib/exam/question-explanations-server";
import { generateExplanationForQuestion, getExplanationAiState, setExplanationAiEnabled, type ExplanationAiState } from "@/lib/ai/explanation-generation";
import { OwnershipError } from "@/lib/exam/test-management";
import { friendlyErrorMessage } from "@/lib/validation-error";
import type { ExplanationParts } from "@/lib/exam/question-explanations";

const idSchema = z.string().trim().min(1).max(80);

export type ExplanationActionResult = { success: true } | { success: false; error: string };
export type ExplanationGenerateResult =
  | { success: true; parts: ExplanationParts; usedToday: number }
  | { success: false; error: string; code?: string; usedToday?: number };

function failure(error: unknown, fallback: string): { success: false; error: string } {
  if (error instanceof ExplanationInputError || error instanceof OwnershipError) return { success: false, error: error.message };
  return { success: false, error: friendlyErrorMessage(error, fallback) };
}

function touched(testId: string) {
  // Students read the explanations when they open a review; only the editor's own page keeps a copy.
  revalidatePath(`/teacher/tests/${testId}/explanations`);
  revalidatePath(`/teacher/tests/${testId}`);
}

/** A teacher writes or edits one explanation (it is a draft again unless `approve`). Allowed on any test they manage: it never changes scoring. */
export async function saveExplanationAction(testId: string, input: unknown): Promise<ExplanationActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const id = idSchema.parse(testId);
    const parsed = z.object({ questionId: idSchema, explain: z.string().max(10_000), trap: z.string().max(10_000), fix: z.string().max(10_000), approve: z.boolean() }).parse(input);
    await saveExplanation(id, profile.id, parsed);
    touched(id);
    return { success: true };
  } catch (error) {
    return failure(error, "Could not save the explanation.");
  }
}

/** Approves one draft: from now on students see it. */
export async function approveExplanationAction(testId: string, questionId: string): Promise<ExplanationActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const id = idSchema.parse(testId);
    await approveExplanation(id, profile.id, idSchema.parse(questionId));
    touched(id);
    return { success: true };
  } catch (error) {
    return failure(error, "Could not approve the explanation.");
  }
}

/** "Approve all": every draft of the test that still matches its question. */
export async function approveAllExplanationsAction(testId: string): Promise<{ success: true; approved: number } | { success: false; error: string }> {
  try {
    const { profile } = await requireTeacherProfile();
    const id = idSchema.parse(testId);
    const approved = await approveAllExplanations(id, profile.id);
    touched(id);
    return { success: true, approved };
  } catch (error) {
    return failure(error, "Could not approve the explanations.");
  }
}

/** Takes an approved explanation back from the students (it becomes a draft). */
export async function unapproveExplanationAction(testId: string, questionId: string): Promise<ExplanationActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const id = idSchema.parse(testId);
    await unapproveExplanation(id, profile.id, idSchema.parse(questionId));
    touched(id);
    return { success: true };
  } catch (error) {
    return failure(error, "Could not take the explanation back.");
  }
}

export async function removeExplanationAction(testId: string, questionId: string): Promise<ExplanationActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const id = idSchema.parse(testId);
    await removeExplanation(id, profile.id, idSchema.parse(questionId));
    touched(id);
    return { success: true };
  } catch (error) {
    return failure(error, "Could not remove the explanation.");
  }
}

/**
 * Asks the AI for the explanation of ONE question (stored as a draft). `force` writes it again over an existing one ("Regenerate"); the bulk button calls this
 * once per question without it, so a question that already has an explanation costs nothing.
 */
export async function generateExplanationAction(testId: string, questionId: string, force: boolean): Promise<ExplanationGenerateResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const id = idSchema.parse(testId);
    const result = await generateExplanationForQuestion({ testId: id, teacherId: profile.id, questionId: idSchema.parse(questionId), force: force === true });
    if (result.success) touched(id);
    return result;
  } catch (error) {
    return failure(error, "Could not ask the AI.");
  }
}

/** The teacher switches "Generate with AI" on or off for themselves. */
export async function setExplanationAiEnabledAction(enabled: boolean): Promise<{ success: true; state: ExplanationAiState } | { success: false; error: string }> {
  try {
    const { profile } = await requireTeacherProfile();
    await setExplanationAiEnabled(profile.id, z.boolean().parse(enabled));
    return { success: true, state: await getExplanationAiState(profile.id) };
  } catch (error) {
    return failure(error, "Could not change the setting.");
  }
}
