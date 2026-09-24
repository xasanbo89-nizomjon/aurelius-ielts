"use server";

import { revalidatePath } from "next/cache";

import { requireTeacherProfile } from "@/lib/session";
import { assignStudentTeacher, getStudentForTeacher } from "@/lib/teacher-students";
import { getHardWordsForStudent } from "@/lib/analytics/teacher-vocabulary-insights";
import { generateVocabularyInsights } from "@/lib/ai/services/vocabulary-insights";
import type { VocabularyInsightsResponse } from "@/lib/ai/prompts/vocabulary-insights";
import { AIServiceUnavailableError } from "@/lib/ai/errors";

export type ActionResult = { success: true } | { success: false; error: string };

export async function assignStudentTeacherAction(studentId: string, teacherId: string | null): Promise<ActionResult> {
  const { profile } = await requireTeacherProfile();
  const result = await assignStudentTeacher(profile.isRootTeacher, studentId, teacherId);
  if (result.success) revalidatePath("/teacher/students");
  return result;
}

export type GetVocabularyInsightsResult =
  | { success: true; insights: VocabularyInsightsResponse }
  | { success: false; error: string };

/**
 * Phase 20 — Teacher Vocabulary Intelligence, "AI Vocabulary Insights".
 * Generated on demand (a button click), not persisted and not run
 * automatically on page load — avoids an AI call/cost on every visit to a
 * student's profile. Ownership-checked the same way the rest of the
 * student detail page is (root sees any student, others only their own).
 */
export async function getVocabularyInsightsAction(studentId: string): Promise<GetVocabularyInsightsResult> {
  try {
    const { profile } = await requireTeacherProfile();
    const student = await getStudentForTeacher(profile.id, studentId, profile.isRootTeacher);
    if (!student) return { success: false, error: "Student not found." };

    const hardWords = await getHardWordsForStudent(studentId);
    if (hardWords.length === 0) {
      return { success: false, error: "Not enough data yet — this student hasn't marked any words Hard." };
    }

    const insights = await generateVocabularyInsights(hardWords);
    return { success: true, insights };
  } catch (error) {
    if (error instanceof AIServiceUnavailableError) {
      return { success: false, error: "AI insights are temporarily unavailable. Try again in a moment." };
    }
    return { success: false, error: "Could not generate vocabulary insights." };
  }
}
