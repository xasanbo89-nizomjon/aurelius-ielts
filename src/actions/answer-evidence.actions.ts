"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireTeacherProfile } from "@/lib/session";
import { clearEvidence, confirmEvidence, EvidenceInputError, setEvidence } from "@/lib/exam/answer-evidence-server";
import { getEvidenceAiState, setEvidenceAiEnabled, suggestEvidenceForNumber, type EvidenceAiState } from "@/lib/ai/evidence-suggestions";
import { OwnershipError } from "@/lib/exam/test-management";
import type { EvidenceItem } from "@/lib/exam/answer-evidence-store";
import { friendlyErrorMessage } from "@/lib/validation-error";

const idSchema = z.string().trim().min(1).max(80);
const slotSchema = z.number().int().min(0).max(60);

export type EvidenceActionResult = { success: true; items: EvidenceItem[] } | { success: false; error: string };
export type EvidenceSuggestActionResult =
  | { success: true; items: EvidenceItem[]; usedToday: number }
  | { success: false; error: string; code?: string; usedToday?: number };

function failure(error: unknown, fallback: string): { success: false; error: string } {
  if (error instanceof EvidenceInputError || error instanceof OwnershipError) return { success: false, error: error.message };
  return { success: false, error: friendlyErrorMessage(error, fallback) };
}

function touched(testId: string) {
  // the review pages read the evidence when they are opened; only the editor's own page keeps a copy
  revalidatePath(`/teacher/tests/${testId}/evidence`);
  revalidatePath(`/teacher/tests/${testId}`);
}

const rangeSchema = z.object({ questionId: idSchema, slot: slotSchema, passageId: idSchema, start: z.number().int().min(0).max(1_000_000), end: z.number().int().min(1).max(1_000_000) });

/** "Set as evidence for Q n": the stretch of the passage the teacher selected, for one question number. Allowed on any test the teacher manages (it never changes scoring). */
export async function setEvidenceAction(testId: string, input: unknown): Promise<EvidenceActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const id = idSchema.parse(testId);
    const items = await setEvidence(id, profile.id, rangeSchema.parse(input));
    touched(id);
    return { success: true, items };
  } catch (error) {
    return failure(error, "Could not save the evidence.");
  }
}

/** Removes the evidence of one number (also how a teacher rejects an AI suggestion). */
export async function clearEvidenceAction(testId: string, input: unknown): Promise<EvidenceActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const id = idSchema.parse(testId);
    const items = await clearEvidence(id, profile.id, z.object({ questionId: idSchema, slot: slotSchema }).parse(input));
    touched(id);
    return { success: true, items };
  } catch (error) {
    return failure(error, "Could not remove the evidence.");
  }
}

/** The teacher confirms an AI suggestion: from now on students see it. */
export async function confirmEvidenceAction(testId: string, input: unknown): Promise<EvidenceActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const id = idSchema.parse(testId);
    const items = await confirmEvidence(id, profile.id, z.object({ questionId: idSchema, slot: slotSchema }).parse(input));
    touched(id);
    return { success: true, items };
  } catch (error) {
    return failure(error, "Could not confirm the suggestion.");
  }
}

/** "Suggest with AI" for one number: stored as a suggestion only - students see nothing until it is confirmed. */
export async function suggestEvidenceAction(testId: string, input: unknown): Promise<EvidenceSuggestActionResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const id = idSchema.parse(testId);
    const parsed = z.object({ questionId: idSchema, slot: slotSchema }).parse(input);
    const result = await suggestEvidenceForNumber({ testId: id, teacherId: profile.id, questionId: parsed.questionId, slot: parsed.slot });
    if (result.success) touched(id);
    return result;
  } catch (error) {
    return failure(error, "Could not ask the AI.");
  }
}

/** The teacher switches "Suggest with AI" on or off for themselves. */
export async function setEvidenceAiEnabledAction(enabled: boolean): Promise<{ success: true; state: EvidenceAiState } | { success: false; error: string }> {
  try {
    const { profile } = await requireTeacherProfile();
    await setEvidenceAiEnabled(profile.id, z.boolean().parse(enabled));
    return { success: true, state: await getEvidenceAiState(profile.id) };
  } catch (error) {
    return failure(error, "Could not change the setting.");
  }
}
