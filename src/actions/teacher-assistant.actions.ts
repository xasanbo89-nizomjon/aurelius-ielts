"use server";

import { requireTeacherProfile } from "@/lib/session";
import { getTeacherAssistantContext } from "@/lib/analytics/teacher-assistant-context";
import { askTeacherAssistant } from "@/lib/ai/services/teacher-assistant";
import type { TeacherAssistantResponse } from "@/lib/ai/prompts/teacher-assistant";
import { askTeacherAssistantSchema } from "@/lib/validations/teacher-assistant";
import { friendlyErrorMessage } from "@/lib/validation-error";
import { AIServiceUnavailableError } from "@/lib/ai/errors";

export type AskTeacherAssistantResult =
  | { success: true; answer: TeacherAssistantResponse; studentCount: number }
  | { success: false; error: string };

/**
 * Phase 25 — Teacher AI Assistant. Every question re-gathers this teacher's
 * OWN students' real data fresh (never trusts a client-cached snapshot) and
 * is a live OpenAI call — deliberately uncached, since questions vary too
 * much for the AIInsightCache "one row per kind" pattern to make sense here.
 */
export async function askTeacherAssistantAction(input: { question: string }): Promise<AskTeacherAssistantResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const parsed = askTeacherAssistantSchema.parse(input);

    const students = await getTeacherAssistantContext(profile.id);
    if (students.length === 0) {
      return { success: false, error: "You don't have any students with data yet." };
    }

    const answer = await askTeacherAssistant(parsed.question, students);
    return { success: true, answer, studentCount: students.length };
  } catch (error) {
    if (error instanceof AIServiceUnavailableError) {
      return { success: false, error: "The AI Assistant is temporarily unavailable. Try again in a moment." };
    }
    return { success: false, error: friendlyErrorMessage(error, "Could not get an answer.") };
  }
}
